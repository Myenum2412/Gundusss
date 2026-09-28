import { z } from 'zod';

export const FeeSchema = z.object({
  id: z.number().int().optional(),
  student_name: z.string().min(1).max(200),
  amount: z.number().positive(),
  status: z.enum(['pending', 'paid', 'overdue']).default('pending'),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  created_at: z.string().optional(),
});

export const CreateFeeSchema = FeeSchema.omit({ id: true, created_at: true });
export const UpdateFeeSchema = CreateFeeSchema.partial();

export type CreateFee = z.infer<typeof CreateFeeSchema>;
export type UpdateFee = z.infer<typeof UpdateFeeSchema>;

export interface Fee {
  id: number;
  student_name: string;
  amount: string | number;
  status: 'pending' | 'paid' | 'overdue';
  due_date: string;
  created_at: string;
}
