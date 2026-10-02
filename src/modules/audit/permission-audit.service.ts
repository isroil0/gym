import { Injectable } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';

/** What `@Controller({ version })` stores — a string, an array, or a symbol. */
type RouteVersion = string | string[] | symbol | undefined;
import type { UserRole } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { ROLES_KEY, SCOPED_ACCESS_KEY } from '../auth/decorators/roles.decorator';

export interface RoutePermission {
  method: string;
  path: string;
  controller: string;
  handler: string;
  /** True when the route is reachable without authentication. */
  public: boolean;
  /**
   * Roles allowed. Empty with `public: false` means any authenticated role.
   */
  roles: UserRole[];
  /**
   * Set when the route narrows access inside the service rather than by role.
   * Its absence on an open route is what the audit is for.
   */
  scopedAccess: string | null;
}

export interface PermissionAudit {
  totalRoutes: number;
  publicRoutes: number;
  /** Open to any authenticated role AND narrowed in the service. Reviewed. */
  serviceScoped: number;
  /**
   * Open to any authenticated role with no scoping declared. **Every entry
   * here needs a human to confirm it is intended.**
   */
  unrestricted: number;
  roleRestricted: number;
  /** The subset that needs review, lifted out so it cannot be missed. */
  needsReview: RoutePermission[];
  routes: RoutePermission[];
}

/**
 * Reports what every route actually requires.
 *
 * Read from the running metadata rather than from a hand-kept document, so it
 * cannot drift: if a decorator is missing, the audit says so. This is the
 * artefact to review when asking "is anything accidentally public?", and the
 * security test suite asserts against it.
 */
@Injectable()
export class PermissionAuditService {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  audit(): PermissionAudit {
    const routes: RoutePermission[] = [];

    for (const wrapper of this.discovery.getControllers()) {
      // `instance` is `any` on the wrapper; narrow it before use.
      const instance: unknown = wrapper.instance;
      const metatype = wrapper.metatype as (new (...args: never[]) => unknown) | undefined;
      if (!instance || typeof instance !== 'object' || !metatype) continue;

      const prototype = Object.getPrototypeOf(instance) as object;
      const controllerPath = this.reflector.get<string | undefined>(PATH_METADATA, metatype) ?? '';
      const controllerVersion = this.reflector.get<RouteVersion>(VERSION_METADATA, metatype);

      for (const methodName of this.scanner.getAllMethodNames(prototype)) {
        const handler = (instance as Record<string, unknown>)[methodName];
        if (typeof handler !== 'function') continue;

        const requestMethod = this.reflector.get<RequestMethod | undefined>(
          METHOD_METADATA,
          handler,
        );
        if (requestMethod === undefined) continue;

        const handlerPath = this.reflector.get<string | undefined>(PATH_METADATA, handler) ?? '';

        routes.push({
          method: RequestMethod[requestMethod] ?? String(requestMethod),
          path: PermissionAuditService.joinPath(controllerPath, handlerPath, controllerVersion),
          controller: metatype.name,
          handler: methodName,
          public:
            this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, metatype]) === true,
          roles:
            this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
              handler,
              metatype,
            ]) ?? [],
          scopedAccess:
            this.reflector.getAllAndOverride<string | undefined>(SCOPED_ACCESS_KEY, [
              handler,
              metatype,
            ]) ?? null,
        });
      }
    }

    routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

    const openToAnyRole = routes.filter((route) => !route.public && route.roles.length === 0);
    const needsReview = openToAnyRole.filter((route) => route.scopedAccess === null);

    return {
      totalRoutes: routes.length,
      publicRoutes: routes.filter((route) => route.public).length,
      serviceScoped: openToAnyRole.length - needsReview.length,
      unrestricted: needsReview.length,
      roleRestricted: routes.filter((route) => !route.public && route.roles.length > 0).length,
      needsReview,
      routes,
    };
  }

  private static joinPath(
    controllerPath: string,
    handlerPath: string,
    version: RouteVersion,
  ): string {
    const segments = [controllerPath, handlerPath]
      .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
      .filter((segment) => segment.length > 0);

    // Only a concrete version string contributes a prefix; VERSION_NEUTRAL is
    // a symbol and an array means several, neither of which names one path.
    const versionPrefix = typeof version === 'string' ? `v${version}` : '';

    return `/${[versionPrefix, ...segments].filter(Boolean).join('/')}`;
  }
}
