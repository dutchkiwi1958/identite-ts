/**
 * ============================================================
 * Winterharbor - MRZ Passport Scanner
 * File: playground/src/main.ts
 * ============================================================
 *
 * Purpose:
 * - Read passport / identity document images with identite-ts
 * - Keep the working identite-ts OCR engine unchanged
 * - Extract useful passport information
 * - Display clean passport information
 * - Store the scanned data for later use in Winterharbor Booking
 *
 * ============================================================
 */

import type { ExtractionResult } from 'identite-ts';

import {
  creerDatamatrixEngine,
  creerOcrEngine,
  extractDocument
} from 'identite-ts';

import {
  type Passe,
  observer
} from './passes';


/**
 * ------------------------------------------------------------
 * OCR ENGINE
 * ------------------------------------------------------------
 *
 * The OCR worker is created only once and reused.
 * This avoids downloading/loading the WASM OCR engine again
 * for every passport scan.
 */

let ocrReel:
  ReturnType<typeof creerOcrEngine> | undefined;


/**
 * ------------------------------------------------------------
 * PASSPORT DATA
 * ------------------------------------------------------------
 */

type PassportData = {

  surname: string;

  given_names: string;

  nationality: string;

  date_of_birth: string;

  sex: string;

  passport_number: string;

  expiry_date: string;

  issuing_country: string;

  confidence: number;

};


let passportData:
  PassportData | null = null;


/**
 * ------------------------------------------------------------
 * PAGE ELEMENTS
 * ------------------------------------------------------------
 */

const zone =
  document.querySelector('#zone')
  as HTMLDivElement;


const fichier =
  document.querySelector('#fichier')
  as HTMLInputElement;


const statut =
  document.querySelector('#statut')
  as HTMLParagraphElement;


const resultat =
  document.querySelector('#resultat')
  as HTMLPreElement;


const apercu =
  document.querySelector('#apercu')
  as HTMLImageElement;


const useDataButton =
  document.querySelector('#use-data')
  as HTMLButtonElement;


const scanAgainButton =
  document.querySelector('#scan-again')
  as HTMLButtonElement;


/**
 * ------------------------------------------------------------
 * FORMAT DATE
 * ------------------------------------------------------------
 *
 * Convert:
 *
 * 1958-07-17
 *
 * to:
 *
 * 17-07-1958
 */

function formatDate(
  value?: string
): string {

  if (!value) {
    return '';
  }

  const parts =
    value.split('-');


  if (parts.length !== 3) {
    return value;
  }


  return (
    `${parts[2]}-${parts[1]}-${parts[0]}`
  );

}


/**
 * ------------------------------------------------------------
 * READ SIMPLE IDENTITE-TS FIELD
 * ------------------------------------------------------------
 *
 * identite-ts normally returns:
 *
 * {
 *     valeur: "...",
 *     source: "mrz",
 *     checksumValide: true
 * }
 */

function valeur(
  field: unknown
): string {

  if (!field) {
    return '';
  }


  if (
    typeof field === 'string'
  ) {

    return field;

  }


  if (
    typeof field === 'object' &&
    field !== null &&
    'valeur' in field
  ) {

    const value =
      (
        field as {
          valeur?: unknown
        }
      ).valeur;


    if (
      value === undefined ||
      value === null
    ) {

      return '';

    }


    return String(value);

  }


  return '';

}


/**
 * ------------------------------------------------------------
 * READ GIVEN NAMES
 * ------------------------------------------------------------
 *
 * identite-ts returns given names similar to:
 *
 * {
 *     valeur: [
 *         "BOB",
 *         "OTTO",
 *         "BERT"
 *     ],
 *     source: "mrz"
 * }
 */

function prenoms(
  field: unknown
): string {

  if (
    !field ||
    typeof field !== 'object'
  ) {

    return '';

  }


  if ('valeur' in field) {

    const value =
      (
        field as {
          valeur?: unknown
        }
      ).valeur;


    if (
      Array.isArray(value)
    ) {

      return value
        .map(
          (item) =>
            String(item)
              .trim()
        )
        .filter(
          (item) =>
            item !== ''
        )
        .join(' ');

    }


    if (
      typeof value === 'string'
    ) {

      return value.trim();

    }

  }


  return '';

}


/**
 * ------------------------------------------------------------
 * DISPLAY RESULT
 * ------------------------------------------------------------
 */

function afficherResultat(
  extraction: ExtractionResult
): void {

  const data =
    extraction.data
    as Record<string, unknown>;


  /**
   * Read the fields returned by identite-ts.
   */

  const nom =
    valeur(
      data.nom
    );


  const firstname =
    prenoms(
      data.prenoms
    );


  const sexe =
    valeur(
      data.sexe
    );


  const naissance =
    valeur(
      data.dateNaissance
    );


  const nationalite =
    valeur(
      data.nationalite
    );


  const numero =
    valeur(
      data.numeroDocument
    );


  const expiration =
    valeur(
      data.dateExpiration
    );


  const confidence =
    Math.round(
      extraction.confidence * 100
    );


  /**
   * Save the passport information.
   *
   * Later this object can be sent directly to the
   * Winterharbor Booking guest form.
   */

  passportData = {

    surname:
      nom,

    given_names:
      firstname,

    nationality:
      nationalite,

    date_of_birth:
      naissance,

    sex:
      sexe,

    passport_number:
      numero,

    expiry_date:
      expiration,

    issuing_country:
      extraction.paysEmetteur ?? '',

    confidence:
      confidence

  };


  /**
   * Show clean result on screen.
   */

  resultat.textContent =
`PASSPORT SCANNED

Surname:          ${passportData.surname}
Given names:      ${passportData.given_names}
Nationality:      ${passportData.nationality}
Date of birth:    ${formatDate(passportData.date_of_birth)}
Sex:              ${passportData.sex}
Passport number:  ${passportData.passport_number}
Expiry date:      ${formatDate(passportData.expiry_date)}

Issuing country:  ${passportData.issuing_country}
MRZ confidence:   ${passportData.confidence} %`;

}


/**
 * ------------------------------------------------------------
 * ANALYSE PASSPORT
 * ------------------------------------------------------------
 */

async function analyser(
  f: File
): Promise<void> {

  /**
   * Display the selected passport image.
   */

  apercu.src =
    URL.createObjectURL(f);


  apercu.style.display =
    'block';


  /**
   * Reset previous result.
   */

  passportData =
    null;


  resultat.textContent =
    'Scanning passport...';


  statut.textContent =
    'Scanning passport... Please wait.';


  const debut =
    performance.now();


  try {

    /**
     * Create OCR engine only once.
     */

    ocrReel ??=
      creerOcrEngine();


    /**
     * Keep the original working OCR observer.
     */

    const passes:
      Passe[] = [];


    /**
     * IMPORTANT:
     *
     * This is the identite-ts extraction method that
     * already works on the iPhone.
     *
     * Do not replace this with generic Tesseract OCR.
     */

    const extraction =
      await extractDocument(
        f,
        {

          engines: {

            ocr:
              observer(
                ocrReel,
                passes
              ),

            datamatrix:
              creerDatamatrixEngine()

          }

        }
      );


    const dureeMs =
      performance.now() -
      debut;


    /**
     * Document not recognized.
     */

    if (
      extraction.document ===
      'inconnu'
    ) {

      statut.textContent =
        'Document could not be recognized. Please try again.';


      resultat.textContent =
        'No passport information found.';


      return;

    }


    /**
     * Display passport information.
     */

    afficherResultat(
      extraction
    );


    statut.textContent =
      `Passport recognized — ${
        Math.round(
          extraction.confidence *
          100
        )
      }% confidence — ${
        (
          dureeMs /
          1000
        ).toFixed(1)
      } seconds`;


  } catch (error) {

    console.error(
      error
    );


    passportData =
      null;


    statut.textContent =
      `Scan error: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`;


    resultat.textContent =
      'Passport could not be scanned.';

  }

}


/**
 * ------------------------------------------------------------
 * OPEN FILE / CAMERA
 * ------------------------------------------------------------
 */

zone.addEventListener(
  'click',
  () => {

    fichier.click();

  }
);


/**
 * ------------------------------------------------------------
 * FILE SELECTED
 * ------------------------------------------------------------
 */

fichier.addEventListener(
  'change',
  () => {

    const f =
      fichier.files?.[0];


    if (f) {

      void analyser(f);

    }

  }
);


/**
 * ------------------------------------------------------------
 * DRAG OVER
 * ------------------------------------------------------------
 */

zone.addEventListener(
  'dragover',
  (event) => {

    event.preventDefault();

    zone.classList.add(
      'actif'
    );

  }
);


/**
 * ------------------------------------------------------------
 * DRAG LEAVE
 * ------------------------------------------------------------
 */

zone.addEventListener(
  'dragleave',
  () => {

    zone.classList.remove(
      'actif'
    );

  }
);


/**
 * ------------------------------------------------------------
 * DROP IMAGE
 * ------------------------------------------------------------
 */

zone.addEventListener(
  'drop',
  (event) => {

    event.preventDefault();


    zone.classList.remove(
      'actif'
    );


    const f =
      event.dataTransfer
        ?.files[0];


    if (f) {

      void analyser(f);

    }

  }
);


/**
 * ------------------------------------------------------------
 * SCAN AGAIN
 * ------------------------------------------------------------
 */

scanAgainButton.addEventListener(
  'click',
  () => {

    /**
     * Clear stored passport.
     */

    passportData =
      null;


    /**
     * Clear previous file.
     *
     * This is important because it allows the same
     * photograph to be selected again.
     */

    fichier.value =
      '';


    /**
     * Reset screen.
     */

    resultat.textContent =
      'No passport scanned.';


    statut.textContent =
      'Ready to scan';


    apercu.src =
      '';


    apercu.style.display =
      'none';


    /**
     * Open camera / file selector again.
     */

    fichier.click();

  }
);


/**
 * ------------------------------------------------------------
 * USE PASSPORT DATA
 * ------------------------------------------------------------
 */

useDataButton.addEventListener(
  'click',
  () => {

    /**
     * No successful passport scan yet.
     */

    if (
      !passportData
    ) {

      alert(
        'Please scan a passport first.'
      );

      return;

    }


    /**
     * Show object in browser console.
     *
     * Later this object will be returned to the
     * Winterharbor Booking guest form.
     */

    console.log(
      'PASSPORT DATA:',
      passportData
    );


    /**
     * Temporary confirmation.
     *
     * In the Booking version this alert will be
     * replaced with automatic form population.
     */

    alert(
`Passport data ready.

Surname:
${passportData.surname}

Given names:
${passportData.given_names}

Passport number:
${passportData.passport_number}

Nationality:
${passportData.nationality}

Date of birth:
${formatDate(passportData.date_of_birth)}

Sex:
${passportData.sex}

Expiry date:
${formatDate(passportData.expiry_date)}

Issuing country:
${passportData.issuing_country}

Confidence:
${passportData.confidence} %`
    );

  }
);
