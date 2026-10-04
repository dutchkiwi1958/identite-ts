import type { ExtractionResult } from 'identite-ts';
import {
  creerDatamatrixEngine,
  creerOcrEngine,
  extractDocument
} from 'identite-ts';

import { type Passe, observer } from './passes';

// Keep one OCR worker alive and reuse it.
// This makes later scans considerably faster.
let ocrReel: ReturnType<typeof creerOcrEngine> | undefined;

const zone = document.querySelector('#zone') as HTMLDivElement;
const fichier = document.querySelector('#fichier') as HTMLInputElement;
const statut = document.querySelector('#statut') as HTMLParagraphElement;
const resultat = document.querySelector('#resultat') as HTMLPreElement;
const apercu = document.querySelector('#apercu') as HTMLImageElement;


/**
 * Convert YYYY-MM-DD to DD-MM-YYYY.
 */
function formatDate(value?: string): string {
  if (!value) return '';

  const parts = value.split('-');

  if (parts.length !== 3) {
    return value;
  }

  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}


/**
 * Safely read a field returned by identite-ts.
 */
function valeur(field: unknown): string {
  if (!field) return '';

  if (typeof field === 'string') {
    return field;
  }

  if (
    typeof field === 'object' &&
    field !== null &&
    'valeur' in field
  ) {
    const value = (field as { valeur?: unknown }).valeur;

    if (value === undefined || value === null) {
      return '';
    }

    return String(value);
  }

  return '';
}


/**
 * Read first names from the array returned by identite-ts.
 */
function prenoms(field: unknown): string {
  if (!Array.isArray(field)) {
    return '';
  }

  return field
    .map((item) => valeur(item))
    .filter((item) => item !== '')
    .join(' ');
}


/**
 * Create clean passport output.
 */
function afficherResultat(extraction: ExtractionResult): void {

  const data = extraction.data as Record<string, unknown>;

  const nom = valeur(data.nom);
  const firstname = prenoms(data.prenoms);
  const sexe = valeur(data.sexe);
  const naissance = valeur(data.dateNaissance);
  const nationalite = valeur(data.nationalite);
  const numero = valeur(data.numeroDocument);
  const expiration = valeur(data.dateExpiration);

  const confidence = Math.round(extraction.confidence * 100);

  resultat.textContent =
`PASSPORT SCANNED

Surname:          ${nom}
Given names:      ${firstname}
Nationality:      ${nationalite}
Date of birth:    ${formatDate(naissance)}
Sex:              ${sexe}
Passport number:  ${numero}
Expiry date:      ${formatDate(expiration)}

Issuing country:  ${extraction.paysEmetteur ?? ''}
Source:           ${extraction.source ?? ''}
MRZ confidence:   ${confidence} %
`;

}


/**
 * Analyse uploaded/captured passport.
 */
async function analyser(f: File): Promise<void> {

  apercu.src = URL.createObjectURL(f);
  apercu.style.display = 'block';

  resultat.textContent = '';

  statut.textContent =
    'Scanning passport... Please wait.';

  const debut = performance.now();

  try {

    // Create OCR engine once.
    ocrReel ??= creerOcrEngine();

    const passes: Passe[] = [];

    const extraction = await extractDocument(f, {
      engines: {
        ocr: observer(ocrReel, passes),
        datamatrix: creerDatamatrixEngine()
      }
    });

    const dureeMs = performance.now() - debut;

    if (extraction.document === 'inconnu') {

      statut.textContent =
        'Document could not be recognized. Please try again.';

      resultat.textContent = '';

      return;
    }

    afficherResultat(extraction);

    statut.textContent =
      `Passport recognized — ${Math.round(
        extraction.confidence * 100
      )}% confidence — ${(dureeMs / 1000).toFixed(1)} seconds`;

  } catch (error) {

    console.error(error);

    statut.textContent =
      `Scan error: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`;

  }
}


/*
 * File selection
 */
zone.addEventListener('click', () => {
  fichier.click();
});


fichier.addEventListener('change', () => {

  const f = fichier.files?.[0];

  if (f) {
    void analyser(f);
  }

});


/*
 * Drag & drop
 */
zone.addEventListener('dragover', (event) => {

  event.preventDefault();

  zone.classList.add('actif');

});


zone.addEventListener('dragleave', () => {

  zone.classList.remove('actif');

});


zone.addEventListener('drop', (event) => {

  event.preventDefault();

  zone.classList.remove('actif');

  const f = event.dataTransfer?.files[0];

  if (f) {
    void analyser(f);
  }

});
