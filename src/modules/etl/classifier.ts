/**
 * Drug classifier — data-driven (rule list) ตาม workflow.md §2 / §6.3
 *
 * จัดยา (จาก DNAME) เข้ากลุ่ม: NSAID / Antibiotic / Allopurinol / Carbamazepine / ...
 * รองรับการแพ้แบบกลุ่ม (cross-reaction) ในขั้นถัดไป
 *
 * NOTE: rule ชุดนี้เป็น "seed" ครอบคลุมยาที่พบบ่อย — ควร align กับ regex จริงใน
 * sjs-ten-ipd-drug.ipynb เพิ่ม/แก้ rule ได้โดยไม่ต้องแตะ logic การ aggregate
 * (เพิ่ม feature = เพิ่มแถวใน CLASSIFIER_RULES เท่านั้น)
 */

export type DrugBucket = 'nsaid' | 'antibiotic' | 'other';

export interface ClassifierRule {
  group: string; // label ที่จะเก็บลง suspect_drug.group + array
  bucket: DrugBucket;
  patterns: RegExp[]; // match กับ DNAME (uppercase)
}

/** บ่งชี้ยาใช้ภายนอก (ไม่ใช่ systemic) */
const TOPICAL_HINT = /\b(GEL|CREAM|OINTMENT|TOPICAL|PATCH|LOTION|SPRAY|EYE|EAR)\b/;

export const CLASSIFIER_RULES: ClassifierRule[] = [
  // ---- NSAIDs ----
  { group: 'Ibuprofen', bucket: 'nsaid', patterns: [/IBUPROFEN/] },
  { group: 'Naproxen', bucket: 'nsaid', patterns: [/NAPROXEN/] },
  { group: 'Diclofenac', bucket: 'nsaid', patterns: [/DICLOFENAC/] },
  { group: 'Mefenamic acid', bucket: 'nsaid', patterns: [/MEFENAMIC/] },
  { group: 'Piroxicam', bucket: 'nsaid', patterns: [/PIROXICAM/] },
  { group: 'Meloxicam', bucket: 'nsaid', patterns: [/MELOXICAM/] },
  { group: 'Celecoxib', bucket: 'nsaid', patterns: [/CELECOXIB/] },
  { group: 'Etoricoxib', bucket: 'nsaid', patterns: [/ETORICOXIB/] },
  { group: 'Indomethacin', bucket: 'nsaid', patterns: [/INDOMETHACIN|INDOMETACIN/] },
  { group: 'Ketorolac', bucket: 'nsaid', patterns: [/KETOROLAC/] },
  { group: 'Aspirin', bucket: 'nsaid', patterns: [/ASPIRIN|ACETYLSALICYLIC|\bASA\b/] },

  // ---- Antibiotics ----
  { group: 'Penicillins', bucket: 'antibiotic', patterns: [/PENICILLIN|AMOXICILLIN|AMOXYCILLIN|AMPICILLIN|CLOXACILLIN|DICLOXACILLIN/] },
  { group: 'Cephalosporins', bucket: 'antibiotic', patterns: [/CEPHALEXIN|CEFAZOLIN|CEFTRIAXONE|CEFIXIME|CEFOTAXIME|CEFDINIR|CEFUROXIME|CEFACLOR/] },
  { group: 'Fluoroquinolones', bucket: 'antibiotic', patterns: [/CIPROFLOXACIN|OFLOXACIN|LEVOFLOXACIN|NORFLOXACIN|MOXIFLOXACIN/] },
  { group: 'Macrolides', bucket: 'antibiotic', patterns: [/AZITHROMYCIN|ERYTHROMYCIN|CLARITHROMYCIN|ROXITHROMYCIN/] },
  { group: 'Sulfonamides', bucket: 'antibiotic', patterns: [/SULFAMETHOXAZOLE|COTRIMOXAZOLE|CO-TRIMOXAZOLE|TRIMETHOPRIM|SULFADIAZINE/] },
  { group: 'Tetracyclines', bucket: 'antibiotic', patterns: [/DOXYCYCLINE|TETRACYCLINE|MINOCYCLINE/] },
  { group: 'Clindamycin', bucket: 'antibiotic', patterns: [/CLINDAMYCIN/] },
  { group: 'Vancomycin', bucket: 'antibiotic', patterns: [/VANCOMYCIN/] },
  { group: 'Metronidazole', bucket: 'antibiotic', patterns: [/METRONIDAZOLE/] },

  // ---- Other high-risk (SJS/TEN) ----
  { group: 'Allopurinol', bucket: 'other', patterns: [/ALLOPURINOL/] },
  { group: 'Carbamazepine', bucket: 'other', patterns: [/CARBAMAZEPINE/] },
  { group: 'Phenytoin', bucket: 'other', patterns: [/PHENYTOIN/] },
  { group: 'Lamotrigine', bucket: 'other', patterns: [/LAMOTRIGINE/] },
  { group: 'Phenobarbital', bucket: 'other', patterns: [/PHENOBARBITAL|PHENOBARBITONE/] },
];

export interface Classification {
  group: string | null;
  bucket: DrugBucket | null;
  systemic: boolean; // เกี่ยวเฉพาะ NSAID (systemic vs topical)
}

/** จัดกลุ่มยา 1 ตัวจากชื่อ (DNAME) */
export function classifyDrug(dname: string): Classification {
  const name = dname.toUpperCase();
  for (const rule of CLASSIFIER_RULES) {
    if (rule.patterns.some((re) => re.test(name))) {
      return {
        group: rule.group,
        bucket: rule.bucket,
        systemic: rule.bucket === 'nsaid' ? !TOPICAL_HINT.test(name) : false,
      };
    }
  }
  return { group: null, bucket: null, systemic: false };
}
