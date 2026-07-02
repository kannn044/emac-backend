/**
 * InMemoryCardRepository — dev/demo/test (ไม่ต้องมี Postgres)
 */
import type { CardRepository } from '@/modules/cards/ports';
import type { AllergyCard } from '@/modules/cards/types';

export class InMemoryCardRepository implements CardRepository {
  private readonly byId = new Map<string, AllergyCard>();
  private readonly byToken = new Map<string, AllergyCard>();
  private readonly byPatient = new Map<string, AllergyCard>();

  async save(card: AllergyCard): Promise<AllergyCard> {
    this.byId.set(card.id, card);
    this.byToken.set(card.renderToken, card);
    this.byPatient.set(`${card.hospcode}:${card.patientId}`, card);
    return card;
  }
  async findById(id: string): Promise<AllergyCard | null> {
    return this.byId.get(id) ?? null;
  }
  async findByRenderToken(token: string): Promise<AllergyCard | null> {
    return this.byToken.get(token) ?? null;
  }
  async findByPatient(
    hospcode: string,
    patientId: string,
  ): Promise<AllergyCard | null> {
    return this.byPatient.get(`${hospcode}:${patientId}`) ?? null;
  }
}
