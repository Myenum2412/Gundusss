import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  APPWRITE_COLLECTIONS,
  getRecord,
  putRecord,
} from '../appwrite.js';

const str = (max = 500) => z.string().max(max).default('');
const list = (maxItems = 30, maxLength = 200) =>
  z.array(z.string().max(maxLength)).max(maxItems).default([]);

const DayHoursSchema = z.object({
  open: z.boolean().default(false),
  allDay: z.boolean().default(false),
  from: z.string().max(10).default('09:00'),
  to: z.string().max(10).default('17:00'),
});

const SpecialHoursSchema = z.object({
  id: z.string().min(1).max(60),
  label: str(120),
  date: str(20),
  closed: z.boolean().default(false),
  from: z.string().max(10).default('09:00'),
  to: z.string().max(10).default('17:00'),
});

const BusinessProfileSchema = z.object({
  name: str(200),
  primaryCategory: str(200),
  additionalCategories: list(20, 100),
  description: str(2000),
  openingDate: str(20),
  businessType: z.enum(['On-site', 'Online', 'Hybrid']).default('On-site'),
  labels: list(30, 60),
  status: z
    .enum(['Open', 'Temporarily closed', 'Permanently closed'])
    .default('Open'),

  phone: str(30),
  secondaryPhone: str(30),
  email: str(255),
  website: str(500),
  whatsapp: str(30),
  social: z
    .object({
      facebook: str(500),
      instagram: str(500),
      x: str(500),
      youtube: str(500),
      linkedin: str(500),
    })
    .default({}),

  location: z
    .object({
      country: str(100),
      state: str(100),
      city: str(100),
      postalCode: str(20),
      addressLine1: str(300),
      addressLine2: str(300),
      locality: str(200),
      serviceArea: z.boolean().default(false),
      serviceAreas: list(30, 100),
      serviceRadiusKm: str(10),
      latitude: str(30),
      longitude: str(30),
      mapUrl: str(500),
      hideAddress: z.boolean().default(false),
    })
    .default({}),

  hours: z
    .object({
      timezone: str(100),
      days: z.record(z.string(), DayHoursSchema).default({}),
      special: z.array(SpecialHoursSchema).max(50).default([]),
      note: str(500),
    })
    .default({}),

  attributes: z
    .object({
      accessibility: list(20, 100),
      amenities: list(30, 100),
      serviceOptions: list(20, 100),
      payments: list(20, 100),
      parking: list(20, 100),
      highlights: list(30, 100),
    })
    .default({}),

  media: z
    .object({
      logoUrl: str(1000),
      coverUrl: str(1000),
      photos: list(50, 1000),
      videoUrl: str(1000),
    })
    .default({}),

  links: z
    .object({
      appointmentUrl: str(1000),
      reservationUrl: str(1000),
      orderAheadUrl: str(1000),
      menuUrl: str(1000),
      placeId: str(200),
      profileUrl: str(1000),
      bookingPolicy: str(2000),
    })
    .default({}),

  messagingEnabled: z.boolean().default(false),
  verificationStatus: z
    .enum(['Unverified', 'Pending', 'Verified'])
    .default('Unverified'),
  verifiedOn: str(20),
  notes: str(4000),
});

const PutBodySchema = z.object({
  profile: BusinessProfileSchema,
});

interface StoredProfile {
  profile: unknown;
  updatedAt: string;
}

const COLLECTION = APPWRITE_COLLECTIONS.businessProfiles;

export async function businessProfileRoutes(app: FastifyInstance) {
  app.get('/api/business-profile', async () => {
    const record = await getRecord<StoredProfile>(COLLECTION, '1');
    if (!record) return { data: { profile: null, updatedAt: null } };
    return {
      data: {
        profile: record.data.profile ?? null,
        updatedAt: record.data.updatedAt ?? null,
      },
    };
  });

  app.put('/api/business-profile', async (req, reply) => {
    const parsed = PutBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid business profile',
        details: parsed.error.flatten(),
      });
    }

    const updatedAt = new Date().toISOString();
    await putRecord<StoredProfile>(COLLECTION, '1', {
      profile: parsed.data.profile,
      updatedAt,
    });

    return { data: { updatedAt } };
  });
}
