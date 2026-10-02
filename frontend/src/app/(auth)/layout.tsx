import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { Wordmark } from '@/components/layout/Wordmark';
import { LanguageSelector } from '@/components/layout/LanguageSelector';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

/**
 * The frame for the signed-out pages.
 *
 * The language selector is here deliberately: somebody who cannot read the
 * sign-in form cannot sign in to change their language later.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: { xs: 2, sm: 3 }, py: 2 }}
      >
        <Wordmark />
        <Stack direction="row" spacing={0.5} alignItems="center">
          <LanguageSelector variant="button" />
          <ThemeToggle />
        </Stack>
      </Stack>

      <Box
        component="main"
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'center',
          px: 2,
          pb: { xs: 4, sm: 10 },
          pt: { xs: 2, sm: 0 },
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 400 }}>{children}</Box>
      </Box>
    </Box>
  );
}
