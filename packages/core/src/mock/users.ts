import type { User } from '../domain/auth';

/**
 * Demo identities for client presentations. These exist only in the mock adapter, which the
 * build excludes unless demo mode is switched on. Real credentials are verified by the server.
 */
export const DEMO_PASSWORD = 'DeskTwin!2026';
export const DEMO_MFA_CODE = '246810';

export const DEMO_USERS: ReadonlyArray<Omit<User, 'tenantId'>> = [
  {
    id: 'usr_alex',
    email: 'alex.morgan@demo.alchmai.com',
    name: 'Alex Morgan',
    role: 'trader',
    deskType: 'independent-trader',
    timezone: 'Europe/London',
    title: 'Independent trader',
  },
  {
    id: 'usr_priya',
    email: 'priya.shah@demo.alchmai.com',
    name: 'Priya Shah',
    role: 'compliance',
    deskType: 'prop-firm',
    timezone: 'Europe/London',
    title: 'Head of Compliance',
  },
  {
    id: 'usr_sam',
    email: 'sam.okafor@demo.alchmai.com',
    name: 'Sam Okafor',
    role: 'admin',
    deskType: 'broker',
    timezone: 'Europe/London',
    title: 'Platform administrator',
  },
];
