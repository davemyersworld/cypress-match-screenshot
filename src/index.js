const path = require('path');

const cypressPaths = {
  SCREENSHOT_FOLDER: 'cypress/match-screenshots',
  ROOT_FOLDER: ''
};

/**
 * Creates unique id strings
 * @return {String}
 */
function uuid () {
  return ([ 1e7 ] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (a) =>
    (a ^ ((Math.random() * 16) >> (a / 4))).toString(16)
  );
}

/**
 * Get relative path
 * @param  {String} str
 * @return {String}
 */
function relPath (str) {
  return path.join(
    cypressPaths.ROOT_FOLDER,
    cypressPaths.SCREENSHOT_FOLDER,
    str
  );
}

function execAndRetry(command, attempt = 1) {
  try {
    return cy.exec(command, {
      log: false,
      timeout: 10000
    });
  } catch (e) {
    console.warn(`Exec Failures: '${command}' on attempt #${attempt}`, e);
    if (attempt <= 3) {
      return execAndRetry(command, ++attempt);
    } else {
      console.warn(`Exec Failure: Giving up on ${command}`);
      throw e;
    }
  }
}

/**
 * Takes a screenshot and, if available, matches it against the screenshot
 * from the previous test run. Assertion will fail if the diff is larger than
 * the specified threshold
 * @param  {String} name
 * @param  {Object} options
 */
function matchScreenshot (name, options = {}) {
  const fileName = `${this.test.parent.title} -- ${this.test.title} -- ${name}`;

  console.log('Taking screenshot');

  // Ensure that the screenshot folders exist
  execAndRetry(`mkdir -p ${cypressPaths.SCREENSHOT_FOLDER}/new`);
  execAndRetry(`mkdir -p ${cypressPaths.SCREENSHOT_FOLDER}/diff`);

  // we need to touch the old file for the first run,
  // we'll check later if the file actually has any content
  // in it or not
  execAndRetry(`touch "${cypressPaths.SCREENSHOT_FOLDER}/${fileName}.png"`);

  const id = uuid();
  let path = null;
  cy
    .screenshot(id, {
      log: false,
      onAfterScreenshot ($el, props) {
        // Store path of screenshot that has been taken
        // This is a reliable way for moving that screenshot file
        //  in the next step!
        path = props.path;
      }
    })
    .then(() => {
      console.log('Move screenshot');
      const oldPath = `${cypressPaths.SCREENSHOT_FOLDER}/${fileName}.png`;
      const newPath = `${cypressPaths.SCREENSHOT_FOLDER}/new/${fileName}.png`;

      execAndRetry(`mv "${path}" "${newPath}"`);

      cy.log('Screenshot taken');
      cy
        .readFile(oldPath, 'utf-8', {
          log: false
        })
        .then((value) => {
          if (value) {
            cy.log('Matching screenshot...');
            execAndRetry(
                `cypress-diff-screenshot ` +
                  `--pathOld="${relPath(`${fileName}.png`)}" ` +
                  `--pathNew="${relPath(`new/${fileName}.png`)}" ` +
                  `--target="${relPath(`diff/${fileName}.png`)}" ` +
                  `--threshold=${options.threshold || '0.005'} ` +
                  `--thresholdType=${options.thresholdType || ''} `
              )
              .then((result) => {
                console.log(`Matched screenshot - Passed: ${result.stdout}`);
                const matches = result.stdout === 'Yay';
                if (Cypress.config('updateScreenshots') || matches) {
                  execAndRetry(
                    `mv "${cypressPaths.SCREENSHOT_FOLDER}/new/${fileName}.png" ` +
                      `"${cypressPaths.SCREENSHOT_FOLDER}/${fileName}.png"`
                  );
                  execAndRetry(
                    `rm "${cypressPaths.SCREENSHOT_FOLDER}/diff/${fileName}.png"`
                  );
                }
                if (!Cypress.config('updateScreenshots')) {
                  assert.isTrue(matches, 'Screenshots match');
                }
              });
          } else {
            cy.log('No previous screenshot found to match against!');
            execAndRetry(
              `mv "${cypressPaths.SCREENSHOT_FOLDER}/new/${fileName}.png" ` +
                `"${cypressPaths.SCREENSHOT_FOLDER}/${fileName}.png"`
            );
          }
        });
    });
}

/**
 * Register `matchScreenshot` custom command
 * @param  {String} - optional custom name for command
 * @param  {String} - optional custom root dir path
 */
function register (
  commandName = 'matchScreenshot',
  cypressRootFolder = cypressPaths.ROOT_FOLDER
) {
  cypressPaths.ROOT_FOLDER = cypressRootFolder;
  Cypress.Commands.add(commandName, matchScreenshot);
}

module.exports = {
  register
};
