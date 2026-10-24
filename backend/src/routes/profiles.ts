import type { FastifyInstance } from 'fastify';

import {
  getProfileOrDefault,
  listProfiles,
  resolveProfileId,
} from '../profiles.js';
import { SUPER_PROFILE_ID } from '../tenant.js';
import { listUsers } from '../users.js';

export async function profileRoutes(app: FastifyInstance) {
  // GET /api/profile — the workspace the request is operating on. A super
  // admin with an X-Profile-Id override sees the selected workspace here.
  app.get('/api/profile', async (req) => {
    const profileId = await resolveProfileId(req);
    const profile = await getProfileOrDefault(
      profileId,
      req.auth?.email ?? ''
    );
    return { data: profile };
  });

  // GET /api/profiles — organization console. The global guard already
  // rejects non-super accounts for this path.
  app.get('/api/profiles', async () => {
    const [profiles, users] = await Promise.all([listProfiles(), listUsers()]);

    const counts = new Map<string, number>();
    for (const user of users) {
      const profileId = (user.profile_id ?? '').trim();
      if (!profileId) continue;
      counts.set(profileId, (counts.get(profileId) ?? 0) + 1);
    }

    return {
      data: profiles
        .map((profile) => ({
          ...profile,
          userCount: counts.get(profile.profileId) ?? 0,
          super: profile.profileId === SUPER_PROFILE_ID,
        }))
        .sort((a, b) =>
          String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))
        ),
    };
  });
}
