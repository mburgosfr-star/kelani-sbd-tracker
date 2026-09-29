import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { translations } from './translations';

const root = path.resolve(process.cwd());
const userInterfaceSources = [
  'src/App.js',
  'src/PlateCalculator.js',
  'src/programProfiles.js',
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('all supported languages expose exactly the same translation keys', () => {
  const languages = ['nl', 'en', 'ca'];
  const canonicalKeys = Object.keys(translations.nl).sort();

  for (const language of languages) {
    expect(Object.keys(translations[language]).sort()).toEqual(canonicalKeys);
    for (const key of canonicalKeys) {
      expect(String(translations[language][key]).trim()).not.toBe('');
    }
  }
});

test('every directly referenced UI translation exists in all languages', () => {
  const referencedKeys = new Set();

  for (const relativePath of userInterfaceSources) {
    const source = read(relativePath);
    for (const match of source.matchAll(/\bt\.([A-Za-z][A-Za-z0-9_]*)/g)) {
      referencedKeys.add(match[1]);
    }
  }

  for (const language of ['nl', 'en', 'ca']) {
    for (const key of referencedKeys) {
      expect(translations[language]).toHaveProperty(key);
    }
  }
});

test('Catalan interactive-action verbs use the imperative rather than the infinitive', () => {
  const imperativeLabels = {
    activateWorkout: 'Activa l’entrenament',
    adjust: 'Ajusta',
    adjustProgram: 'Ajusta el programa',
    cancel: 'Cancel·la',
    check: 'Comprova',
    close: 'Tanca',
    completeRestDay: 'Completa el dia de descans',
    completeWorkout: "Finalitza l'entrenament",
    contactKelani: 'Contacta',
    dataManagementAction: 'Gestiona',
    edit: 'Edita',
    editBodyData: 'Actualitza',
    exportData: 'Exporta les dades',
    exportDataShort: 'Exporta',
    importBackupAction: 'Importa còpia',
    importData: 'Importa les dades',
    importDataShort: 'Importa',
    onboardingStartSetup: 'Comença',
    openWorkout: 'Obre l’entrenament',
    plateCalculatorClose: 'Tanca',
    reportBug: 'Informa d’un error',
    reportIssueShort: 'Informa d’un error',
    resetConfirmCancel: 'Cancel·la',
    resetConfirmConfirm: 'Sí, esborra-ho tot',
    restart: 'Torna a començar',
    restTimerOpenDndSettings: 'Obre la configuració de No molestar',
    restTimerTestAlert: 'Prova l’alerta',
    save: 'Desa',
    shareCycleExperience: 'Comparteix la teva experiència',
    showAllWorkouts: 'Mostra tots els entrenaments',
    showFewerWorkouts: 'Mostra menys entrenaments',
    smartCopyDiagnosis: 'Copia el diagnòstic',
    smartWorkoutInfo: 'Obre la informació de l’entrenament',
    startFromScratch: 'Reinicia',
    startNewCycle: 'Comença un nou cicle',
    switchToSmartAction: 'Canvia permanentment a Smart',
    updateCheckNow: 'Comprova ara',
    updateCheckAutomatically: 'Comprova automàticament si hi ha actualitzacions',
    updateDownloadGitHub: 'Baixa des de GitHub',
    updateDownloadIzzy: 'Obre a IzzyOnDroid',
    updatesAction: 'Gestiona',
    usageCopy: 'Copia',
    usageEmail: 'Envia per correu a Kelani',
    usageShareAction: 'Comparteix dades d’ús',
    verifyRelease: 'Verifica la versió',
    view: 'Consulta',
    whatsNewShowAutomatically: 'Mostra automàticament després de les actualitzacions',
    whatsNewView: 'Consulta les novetats',
  };

  for (const [key, expectedLabel] of Object.entries(imperativeLabels)) {
    expect(translations.ca[key]).toBe(expectedLabel);
  }
});

test('UI components do not contain raw prose in JSX or literal accessibility labels', () => {
  for (const relativePath of userInterfaceSources) {
    const source = read(relativePath);
    const sourceFile = ts.createSourceFile(
      relativePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JSX
    );
    const rawText = [];
    const literalAccessibilityLabels = [];

    function visit(node) {
      if (ts.isJsxText(node)) {
        const text = node.getText(sourceFile).replace(/\s+/g, ' ').trim();
        const allowedUnitSymbols = new Set(['kg']);
        if (/[A-Za-zÀ-ÿ]{2}/.test(text) && !allowedUnitSymbols.has(text)) {
          rawText.push(text);
        }
      }

      if (
        ts.isJsxAttribute(node) &&
        node.name.getText(sourceFile) === 'aria-label' &&
        node.initializer &&
        ts.isStringLiteral(node.initializer) &&
        /[A-Za-zÀ-ÿ]{2}/.test(node.initializer.text)
      ) {
        literalAccessibilityLabels.push(node.initializer.text);
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    expect(rawText).toEqual([]);
    expect(literalAccessibilityLabels).toEqual([]);
  }
});

test('translated UI text never falls back to a hardcoded display string', () => {
  for (const relativePath of userInterfaceSources) {
    const source = read(relativePath);
    const sourceFile = ts.createSourceFile(
      relativePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JSX
    );
    const literalFallbacks = [];

    function containsTranslationAccess(node) {
      let found = false;

      function inspect(child) {
        if (
          ts.isPropertyAccessExpression(child) &&
          ['t', 'currentTranslations'].includes(child.expression.getText(sourceFile))
        ) {
          found = true;
        }
        if (!found) ts.forEachChild(child, inspect);
      }

      inspect(node);
      return found;
    }

    function visit(node) {
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken &&
        containsTranslationAccess(node.left) &&
        (ts.isStringLiteral(node.right) || ts.isTemplateExpression(node.right))
      ) {
        literalFallbacks.push(node.getText(sourceFile));
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    expect(literalFallbacks).toEqual([]);
  }
});
