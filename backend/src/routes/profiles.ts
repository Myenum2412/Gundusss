import type { FastifyInstance } from 'fastify';

import {
  deleteWorkspaceAndData,
  getProfileOrDefault,
  listProfiles,
  purgeAllExceptSuper,
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

  // DELETE /api/profiles/:profileId — deletes a workspace profile, its enrolled users, and all scoped data
  app.delete<{ Params: { profileId: string } }>(
    '/api/profiles/:profileId',
    async (req, reply) => {
      if (req.auth?.super !== true) {
        return reply.code(403).send({ error: 'Super-admin access required.' });
      }
      const { profileId } = req.params;
      if (profileId === SUPER_PROFILE_ID) {
        return reply
          .code(400)
          .send({ error: 'The super-admin workspace cannot be deleted.' });
      }
      try {
        const result = await deleteWorkspaceAndData(profileId);
        return { data: result };
      } catch (err: any) {
        return reply
          .code(500)
          .send({ error: err?.message || 'Failed to delete workspace' });
      }
    }
  );

  // POST /api/profiles/purge-all-except-super — deletes all users, data, and profiles except developer@myenum.in
  app.post('/api/profiles/purge-all-except-super', async (req, reply) => {
    if (req.auth?.super !== true) {
      return reply.code(403).send({ error: 'Super-admin access required.' });
    }
    try {
      const result = await purgeAllExceptSuper();
      return { data: result };
    } catch (err: any) {
      return reply
        .code(500)
        .send({ error: err?.message || 'Failed to purge users and data' });
    }
  });
}
