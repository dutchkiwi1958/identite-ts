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


/*
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */

const bookingReceiver =
  'https://booking.winterharbor.online/booking/admin/actions/passport_scan_receive.php';


/*
 * Read scan token from:
 *
 * https://dutchkiwi1958.github.io/identite-ts/?token=...
 */

const urlParams =
  new URLSearchParams(
    window.location.search
  );

const scanToken =
  urlParams.get('token') ?? '';


/*
 * ============================================================
 * OCR ENGINE
 * ============================================================
 */

let ocrReel:
  ReturnType<typeof creerOcrEngine> | undefined;


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


let passportData:
  PassportData | null = null;


/*
 * Keep track of the temporary passport preview URL.
 */

let previewUrl:
  string | null = null;


/*
 * ============================================================
 * PAGE ELEMENTS
 * ============================================================
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


/*
 * ============================================================
 * DATE FORMAT
 * ============================================================
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


/*
 * ============================================================
 * READ IDENTITE-TS VALUE
 * ============================================================
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


/*
 * ============================================================
 * GIVEN NAMES
 * ============================================================
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
            String(item).trim()
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


/*
 * ============================================================
 * REMOVE PASSPORT IMAGE PREVIEW
 * ============================================================
 */

function removePreview(): void {

  if (previewUrl) {

    URL.revokeObjectURL(
      previewUrl
    );

    previewUrl =
      null;

  }


  apercu.src =
    '';


  apercu.style.display =
    'none';

}


/*
 * ============================================================
 * DISPLAY RESULT
 * ============================================================
 */

function afficherResultat(
  extraction: ExtractionResult
): void {

  const data =
    extraction.data
    as Record<string, unknown>;


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


  /*
   * Save extracted information in memory.
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


  /*
   * Display information for staff verification.
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
   * Remove previous preview first.
   */

  removePreview();


  /*
   * Create temporary local preview.
   *
   * This does NOT upload the photograph.
   */

  previewUrl =
    URL.createObjectURL(f);


  apercu.src =
    previewUrl;


  apercu.style.display =
    'block';


  passportData =
    null;


  resultat.textContent =
    'Scanning passport...';


  statut.textContent =
    'Scanning passport... Please wait.';


  const debut =
    performance.now();


  try {

    /*
     * Create/reuse OCR worker.
     */

    ocrReel ??=
      creerOcrEngine();


    const passes:
      Passe[] = [];


    /*
     * Keep the identite-ts OCR implementation
     * that already works on the iPhone.
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
     * Display extracted information.
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

    const f =
      fichier.files?.[0];


    if (f) {

      void analyser(f);

    }

  }
);


/*
 * ============================================================
 * DRAG & DROP
 * ============================================================
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


zone.addEventListener(
  'dragleave',
  () => {

    zone.classList.remove(
      'actif'
    );

  }
);


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


/*
 * ============================================================
 * SCAN AGAIN
 * ============================================================
 */

scanAgainButton.addEventListener(
  'click',
  () => {

    passportData =
      null;


    fichier.value =
      '';


    resultaat.textContent =
      'No passport scanned.';


    statut.textContent =
      'Ready to scan';


    removePreview();


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
     * Scanner must have been opened with a valid
     * scan token from the Booking computer.
     */

    if (!scanToken) {

      alert(
        'No scan token found.\n\n'
        + 'Please open this scanner using the QR code '
        + 'from the Booking computer.'
      );

      return;

    }


    /*
     * Basic client-side token validation.
     *
     * Server performs the real validation again.
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
     * Disable button so staff cannot accidentally
     * submit the same passport twice.
     */

    useDataButton.disabled =
      true;


    useDataButton.textContent =
      'Sending...';


    statut.textContent =
      'Sending passport data to Booking...';


    try {

      /*
       * IMPORTANT:
       *
       * Only extracted text fields are sent.
       *
       * The passport photograph is NOT included.
       */

      const response =
        await fetch(
          bookingReceiver,
          {

            method:
              'POST',

            headers: {

              'Content-Type':
                'application/json'

            },

            body:
              JSON.stringify({

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
                  passportData.confidence

              })

          }
        );


      /*
       * Try to read JSON response.
       */

      let data:
        {
          success?: boolean;
          message?: string;
          error?: string;
        };


      try {

        data =
          await response.json();

      } catch {

        throw new Error(
          'Invalid response from Booking server.'
        );

      }


      /*
       * Server reported an error.
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
       * Remove passport photograph from the page/browser
       * preview after successful transmission.
       */

      removePreview();


      /*
       * Clear file input.
       */

      fichier.value =
        '';


      /*
       * Clear sensitive data from our JS variable.
       */

      passportData =
        null;


      /*
       * Show confirmation.
       */

      resultaat.textContent =
`✓ PASSPORT DATA SENT

The passport information was successfully
sent to the Booking computer.

You may close this scanner.`;


      statut.textContent =
        'Passport data sent successfully.';


      useDataButton.textContent =
        '✓ Data Sent';


      /*
       * Keep button disabled because this token
       * is single-use.
       */

      useDataButton.disabled =
        true;


      /*
       * Scan Again also should not reuse this token.
       */

      scanAgainButton.disabled =
        true;


  } catch (error) {

      console.error(
        error
      );


      alert(
        error instanceof Error
          ? error.message
          : 'Could not send passport data to Booking.'
      );


      useDataButton.disabled =
        false;


      useDataButton.textContent =
        '✓ Use Passport Data';


      statut.textContent =
        'Could not connect to Booking server.';

    }

  }
);
