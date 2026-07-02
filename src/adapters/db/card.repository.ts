/**
 * PgCardRepository — allergy_card (immutable) — workflow.md §7
 */
import type { Pool } from 'pg';
import type { CardRepository } from '@/modules/cards/ports';
import type { AllergyCard, CardPayload } from '@/modules/cards/types';

interface CardRow {
  id: string;
  patient_id: string;
  verification_id: string;
  provider_id: string;
  hospcode: string;
  render_token: string;
  payload: CardPayload;
  canonical_payload: string;
  signature: string;
  signature_alg: string;
  key_id: string;
  issued_at: Date | string;
}

function toCard(row: CardRow): AllergyCard {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    verificationId: String(row.verification_id),
    providerId: row.provider_id,
    hospcode: row.hospcode,
    renderToken: row.render_token,
    payload: row.payload,
    canonicalPayload: row.canonical_payload,
    signature: row.signature,
    signatureAlg: row.signature_alg,
    keyId: row.key_id,
    issuedAt:
      row.issued_at instanceof Date
        ? row.issued_at.toISOString()
        : new Date(row.issued_at).toISOString(),
  };
}

export class PgCardRepository implements CardRepository {
  constructor(private readonly pool: Pool) {}

  async save(card: AllergyCard): Promise<AllergyCard> {
    await this.pool.query(
      `INSERT INTO allergy_card
         (id, patient_id, verification_id, provider_id, hospcode, render_token,
          payload, canonical_payload, signature, signature_alg, key_id, issued_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)`,
      [
        card.id,
        card.patientId,
        card.verificationId,
        card.providerId,
        card.hospcode,
        card.renderToken,
        JSON.stringify(card.payload),
        card.canonicalPayload,
        card.signature,
        card.signatureAlg,
        card.keyId,
        card.issuedAt,
      ],
    );
    return card;
  }

  async findById(id: string): Promise<AllergyCard | null> {
    const res = await this.pool.query<CardRow>(
      `SELECT * FROM allergy_card WHERE id = $1 LIMIT 1`,
      [id],
    );
    return res.rows[0] ? toCard(res.rows[0]) : null;
  }

  async findByRenderToken(token: string): Promise<AllergyCard | null> {
    const res = await this.pool.query<CardRow>(
      `SELECT * FROM allergy_card WHERE render_token = $1 LIMIT 1`,
      [token],
    );
    return res.rows[0] ? toCard(res.rows[0]) : null;
  }

  async findByPatient(
    hospcode: string,
    patientId: string,
  ): Promise<AllergyCard | null> {
    if (!/^\d+$/.test(patientId)) return null;
    const res = await this.pool.query<CardRow>(
      `SELECT * FROM allergy_card WHERE patient_id = $1 AND hospcode = $2
       ORDER BY issued_at DESC LIMIT 1`,
      [patientId, hospcode],
    );
    return res.rows[0] ? toCard(res.rows[0]) : null;
  }
}
