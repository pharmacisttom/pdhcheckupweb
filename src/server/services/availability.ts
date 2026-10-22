import { db } from '@/lib/db';
import { activeStatuses } from '@/lib/domain';
import { bookingPolicy } from './booking-policy';
export async function availableSlots(from: Date) {
  if (!(await bookingPolicy()).onlineEnabled) return [];
  const slots = await db.slot.findMany({ where: { startsAt: { gte: from, lt: new Date(from.getTime() + 31 * 86400000) }, closed: false, day: { blackout: false } }, include: { day: true }, orderBy: { startsAt: 'asc' }, take: 300 });
  const dayIds = [...new Set(slots.map(s => s.dayId))];
  const [allSlots, bookings, holds] = await Promise.all([
    db.slot.findMany({ where: { dayId: { in: dayIds } }, select: { id: true, dayId: true } }),
    db.booking.groupBy({ by: ['slotId'], where: { slot: { dayId: { in: dayIds } }, status: { in: activeStatuses } }, _count: { _all: true } }),
    db.hold.groupBy({ by: ['slotId'], where: { slot: { dayId: { in: dayIds } }, consumed: false, expiresAt: { gt: new Date() } }, _count: { _all: true } }),
  ]);
  const usage = new Map<string, number>(); const daily = new Map<string, number>(); const daysBySlot = new Map(allSlots.map(s => [s.id, s.dayId]));
  for (const allocation of [...bookings, ...holds]) { const n = allocation._count._all; usage.set(allocation.slotId, (usage.get(allocation.slotId) ?? 0) + n); const day = daysBySlot.get(allocation.slotId)!; daily.set(day, (daily.get(day) ?? 0) + n); }
  return slots.map(slot => ({ id: slot.id, day: slot.dayId, startsAt: slot.startsAt, endsAt: slot.endsAt, available: slot.startsAt.getTime() < Date.now() + 86400000 ? 0 : Math.max(0, Math.min(slot.capacity - slot.reservedCapacity - (usage.get(slot.id) ?? 0), slot.day.capacity - (daily.get(slot.dayId) ?? 0))) }));
}
