'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';

export interface TabDefinition {
  value: string;
  label: string;
  /** Shown as a small count next to the label. */
  badge?: number;
}

/**
 * Tabs whose selection lives in the URL.
 *
 * A colleague sent a link to "this member's payments" should land on the
 * payments tab, and the back button should step between tabs the way it steps
 * between pages.
 */
export function TabbedSection({
  tabs,
  active,
  param = 'tab',
  children,
}: {
  tabs: TabDefinition[];
  active: string;
  param?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const select = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === tabs[0]?.value) params.delete(param);
      else params.set(param, value);
      const search = params.toString();
      router.replace(`${pathname}${search ? `?${search}` : ''}`, { scroll: false });
    },
    [router, pathname, searchParams, param, tabs],
  );

  return (
    <>
      <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', mb: 2.5 }}>
        <Tabs
          value={active}
          onChange={(_, value: string) => select(value)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
        >
          {tabs.map((tab) => (
            <Tab
              key={tab.value}
              value={tab.value}
              label={
                tab.badge !== undefined ? (
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                    {tab.label}
                    <Box
                      component="span"
                      sx={{
                        px: 0.75,
                        borderRadius: 1,
                        bgcolor: 'background.sunken',
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        lineHeight: '16px',
                      }}
                    >
                      {tab.badge}
                    </Box>
                  </Box>
                ) : (
                  tab.label
                )
              }
            />
          ))}
        </Tabs>
      </Box>
      {children}
    </>
  );
}
