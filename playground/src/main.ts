import type { ExtractionResult } from 'identite-ts';

import {
  creerDatamatrixEngine,
  creerOcrEngine,
  extractDocument,
} from 'identite-ts';

import {
  type Passe,
  observer,
} from './passes';


/*
 * ============================================================
 * IDENTITE-TS PASSPORT SCANNER
 * ============================================================
 *
 * File:
 * playground/src/main.ts
 *
 * Version:
 * VER 1
 *
 * Purpose:
 * - Scan a passport on the phone.
 * - Extract passport/MRZ information locally.
 * - Read the temporary scan token from the URL.
 * - Send extracted passport data to the server.
 *
 * Important:
 * - The passport photograph is NOT sent to the server.
 * - The photograph is only used locally for scanning.
 * - Only extracted text data is transmitted.
 *
 * Scanner:
 * https://dutchkiwi1958.github.io/identite-ts/
 *
 * Receiver:
 * https://booking.winterharbor.online/admin/actions/
 * passport_scan_receive.php
 *
 * ============================================================
 */


/*
 * ============================================================
 * TEMPORARY VERSION LABEL
 * ============================================================
 *
 * This is temporary.
 *
 * If VER 1 appears on the iPhone, we know that GitHub Pages
 * is running this version of main.ts.
 * ============================================================
 */

const versionLabel = document.createElement('div');

versionLabel.textContent = 'VER 1';

versionLabel.style.position = 'fixed';
versionLabel.style.top = '5px';
versionLabel.style.left = '5px';
versionLabel.style.zIndex = '99999';
versionLabel.style.background = 'red';
versionLabel.style.color = 'white';
versionLabel.style.padding = '6px 10px';
versionLabel.style.fontWeight = 'bold';
versionLabel.style.fontSize = '18px';
versionLabel.style.borderRadius = '4px';

document.body.appendChild(versionLabel);


/*
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */

const receiverUrl =
  'https://booking.winterharbor.online/admin/actions/passport_scan_receive.php';


/*
 * Read temporary scan token from URL:
 *
 * ?token=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 */

const urlParams = new URLSearchParams(window.location.search);

const scanToken = urlParams.get('token') ?? '';


/*
 * ============================================================
 * OCR ENGINE
 * ============================================================
 *
 * The OCR engine contains a worker.
 *
 * Create it once and reuse it for subsequent scans.
 * ============================================================
 */

let ocrReel: ReturnType<typeof creerOcrEngine> | undefined;


/*
 * ============================================================
 * PASSPORT DATA
 * ============================================================
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


let passportData: PassportData | null = null;


/*
 * Temporary local image URL.
 *
 * This is only used to display the passport photograph
 * on the device while scanning.
 */

let previewUrl: string | null = null;


/*
 * ============================================================
 * PAGE ELEMENTS
 * ============================================================
 */

const zone = document.querySelector('#zone') as HTMLDivElement;

const fichier = document.querySelector('#fichier') as HTMLInputElement;

const statut = document.querySelector('#statut') as HTMLParagraphElement;

const resultat = document.querySelector('#resultat') as HTMLPreElement;

const apercu = document.querySelector('#apercu') as HTMLImageElement;

const useDataButton =
  document.querySelector('#use-data') as HTMLButtonElement;

const scanAgainButton =
  document.querySelector('#scan-again') as HTMLButtonElement;


/*
 * ============================================================
 * FORMAT DATE
 * ============================================================
 */

function formatDate(value?: string): string {

  if (!value) {
    return '';
  }

  const parts = value.split('-');

  if (parts.length !== 3) {
    return value;
  }

  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}


/*
 * ============================================================
 * READ IDENTITE-TS VALUE
 * ============================================================
 */

function valeur(field: unknown): string {

  if (!field) {
    return '';
  }


  if (typeof field === 'string') {
    return field;
  }


  if (
    typeof field === 'object' &&
    field !== null &&
    'valeur' in field
  ) {

    const value = (
      field as {
        valeur?: unknown;
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


/*
 * ============================================================
 * READ GIVEN NAMES
 * ============================================================
 */

function prenoms(field: unknown): string {

  if (
    !field ||
    typeof field !== 'object'
  ) {
    return '';
  }


  if ('valeur' in field) {

    const value = (
      field as {
        valeur?: unknown;
      }
    ).valeur;


    /*
     * identite-ts may return given names as an array.
     */

    if (Array.isArray(value)) {

      return value
        .map((item) => String(item).trim())
        .filter((item) => item !== '')
        .join(' ');
    }


    /*
     * Or as a normal string.
     */

    if (typeof value === 'string') {
      return value.trim();
    }
  }


  return '';
}


/*
 * ============================================================
 * REMOVE LOCAL PASSPORT PREVIEW
 * ============================================================
 */

function removePreview(): void {

  if (previewUrl) {

    URL.revokeObjectURL(previewUrl);

    previewUrl = null;
  }


  apercu.src = '';

  apercu.style.display = 'none';
}


/*
 * ============================================================
 * DISPLAY PASSPORT RESULT
 * ============================================================
 */

function afficherResultat(
  extraction: ExtractionResult
): void {

  const data =
    extraction.data as Record<string, unknown>;


  const nom = valeur(
    data.nom
  );


  const firstname = prenoms(
    data.prenoms
  );


  const sexe = valeur(
    data.sexe
  );


  const naissance = valeur(
    data.dateNaissance
  );


  const nationalite = valeur(
    data.nationalite
  );


  const numero = valeur(
    data.numeroDocument
  );


  const expiration = valeur(
    data.dateExpiration
  );


  const confidence =
    Math.round(
      extraction.confidence * 100
    );


  /*
   * Keep extracted information temporarily in memory.
   */

  passportData = {
    surname: nom,
    given_names: firstname,
    nationality: nationalite,
    date_of_birth: naissance,
    sex: sexe,
    passport_number: numero,
    expiry_date: expiration,
    issuing_country: extraction.paysEmetteur ?? '',
    confidence: confidence,
  };


  /*
   * Display information so staff can verify the scan.
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


/*
 * ============================================================
 * ANALYSE PASSPORT
 * ============================================================
 */

async function analyser(
  f: File
): Promise<void> {

  /*
   * Remove previous passport preview.
   */

  removePreview();


  /*
   * Create temporary LOCAL image preview.
   *
   * The passport image is NOT uploaded.
   */

  previewUrl = URL.createObjectURL(f);

  apercu.src = previewUrl;

  apercu.style.display = 'block';


  /*
   * Clear previous passport information.
   */

  passportData = null;


  resultat.textContent =
    'Scanning passport...';


  statut.textContent =
    'Scanning passport... Please wait.';


  const debut = performance.now();


  try {

    /*
     * Create OCR engine once.
     */

    ocrReel ??= creerOcrEngine();


    const passes: Passe[] = [];


    /*
     * Run identite-ts.
     */

    const extraction =
      await extractDocument(
        f,
        {
          engines: {
            ocr: observer(
              ocrReel,
              passes
            ),

            datamatrix:
              creerDatamatrixEngine(),
          },
        }
      );


    const dureeMs =
      performance.now() - debut;


    /*
     * Document was not recognized.
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


    /*
     * Display extracted passport information.
     */

    afficherResultat(extraction);


    statut.textContent =
      `Passport recognized — ${
        Math.round(
          extraction.confidence * 100
        )
      }% confidence — ${
        (
          dureeMs / 1000
        ).toFixed(1)
      } seconds`;

  } catch (error) {

    console.error(error);


    passportData = null;


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


/*
 * ============================================================
 * OPEN CAMERA / FILE
 * ============================================================
 */

zone.addEventListener(
  'click',
  () => {

    fichier.click();

  }
);


/*
 * ============================================================
 * FILE SELECTED
 * ============================================================
 */

fichier.addEventListener(
  'change',
  () => {

    const f = fichier.files?.[0];


    if (f) {
      void analyser(f);
    }

  }
);


/*
 * ============================================================
 * DRAG OVER
 * ============================================================
 */

zone.addEventListener(
  'dragover',
  (event) => {

    event.preventDefault();

    zone.classList.add('actif');

  }
);


/*
 * ============================================================
 * DRAG LEAVE
 * ============================================================
 */

zone.addEventListener(
  'dragleave',
  () => {

    zone.classList.remove('actif');

  }
);


/*
 * ============================================================
 * DROP FILE
 * ============================================================
 */

zone.addEventListener(
  'drop',
  (event) => {

    event.preventDefault();

    zone.classList.remove('actif');


    const f =
      event.dataTransfer?.files[0];


    if (f) {
      void analyser(f);
    }

  }
);


/*
 * ============================================================
 * SCAN AGAIN
 * ============================================================
 */

scanAgainButton.addEventListener(
  'click',
  () => {

    /*
     * Clear previous extracted information.
     */

    passportData = null;


    /*
     * Clear selected file.
     */

    fichier.value = '';


    /*
     * Reset display.
     */

    resultat.textContent =
      'No passport scanned.';


    statut.textContent =
      'Ready to scan';


    /*
     * Remove previous image.
     */

    removePreview();


    /*
     * Open camera/file selector.
     */

    fichier.click();

  }
);


/*
 * ============================================================
 * USE PASSPORT DATA
 * ============================================================
 */

useDataButton.addEventListener(
  'click',
  async () => {

    /*
     * Passport must first be scanned.
     */

    if (!passportData) {

      alert(
        'Please scan a passport first.'
      );

      return;
    }


    /*
     * Scanner must have been opened using a QR code
     * containing the temporary scan token.
     */

    if (!scanToken) {

      alert(
        'No scan token found.\n\n'
        + 'Please open this scanner using the QR code '
        + 'shown on the computer.'
      );

      return;
    }


    /*
     * Basic browser-side token validation.
     *
     * The PHP receiver performs the real validation again.
     */

    if (
      !/^[a-f0-9]{64}$/.test(
        scanToken
      )
    ) {

      alert(
        'Invalid scan token.'
      );

      return;
    }


    /*
     * Prevent accidental double submission.
     */

    useDataButton.disabled = true;

    useDataButton.textContent =
      'Sending...';


    statut.textContent =
      'Sending passport data...';


    try {

      /*
       * ======================================================
       * SEND PASSPORT DATA
       * ======================================================
       *
       * ONLY extracted text data is transmitted.
       *
       * The passport photograph is NOT transmitted.
       * ======================================================
       */

      const response =
        await fetch(
          receiverUrl,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              scan_token:
                scanToken,

              firstname:
                passportData.given_names,

              lastname:
                passportData.surname,

              nationality:
                passportData.nationality,

              date_of_birth:
                passportData.date_of_birth,

              sex:
                passportData.sex,

              id_number:
                passportData.passport_number,

              validtill:
                passportData.expiry_date,

              confidence:
                passportData.confidence,
            }),
          }
        );


      /*
       * Read JSON response from PHP.
       */

      let data: {
        success?: boolean;
        message?: string;
        error?: string;
      };


      try {

        data =
          await response.json();

      } catch {

        throw new Error(
          'Invalid response from server.'
        );
      }


      /*
       * PHP receiver reported an error.
       */

      if (
        !response.ok ||
        !data.success
      ) {

        alert(
          data.message ||
          data.error ||
          '⚠️ Onbekende fout.'
        );


        useDataButton.disabled =
          false;


        useDataButton.textContent =
          '✓ Use Passport Data';


        statut.textContent =
          'Passport data was not sent.';


        return;
      }


      /*
       * ======================================================
       * SUCCESS
       * ======================================================
       */


      /*
       * Remove local passport photograph.
       */

      removePreview();


      /*
       * Clear file input.
       */

      fichier.value = '';


      /*
       * Clear passport information from JS memory.
       */

      passportData = null;


      /*
       * Display confirmation.
       */

      resultat.textContent =
`✓ PASSPORT DATA SENT

The passport information was successfully sent.

You may close this scanner.`;


      statut.textContent =
        'Passport data sent successfully.';


      useDataButton.textContent =
        '✓ Data Sent';


      /*
       * Token is single-use.
       *
       * Do not allow another submission.
       */

      useDataButton.disabled = true;


      /*
       * A new passport scan requires a new QR/token.
       */

      scanAgainButton.disabled = true;

  } catch (error) {

      console.error(error);


      alert(
        error instanceof Error
          ? error.message
          : 'Could not send passport data.'
      );


      useDataButton.disabled =
        false;


      useDataButton.textContent =
        '✓ Use Passport Data';


      statut.textContent =
        'Could not connect to server.';
    }

  }
);
