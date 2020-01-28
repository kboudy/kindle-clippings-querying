const readline = require('readline'),
  fs = require('fs'),
  path = require('path'),
  chalk = require('chalk'),
  homedir = require('os').homedir(),
  moment = require('moment');

const allFields = [
  '#',
  'bookTitle',
  'author',
  'pageStart',
  'pageEnd',
  'createdDate',
  'highlightedText',
];

const chalkColors = {
  '#': chalk.blue,
  bookTitle: chalk.yellow,
  author: chalk.magenta,
  pageStart: chalk.cyan,
  pageEnd: chalk.cyan,
  createdDate: chalk.green,
  highlightedText: chalk.white,
};

const getEmptyClip = () => {
  return {
    bookTitle: null,
    author: null,
    pageStart: null,
    pageEnd: null,
    createdDate: null,
    highlightedText: null,
  };
};

const myClippingPath = path.join(
  homedir,
  'Dropbox/app_config/kindle-bookmark-querying/My Clippings.txt',
);

const argOptions = {
  fields: {
    alias: 'f',
    type: 'string',
    description: `Comma-delimited field names (${allFields.join(',')})`,
  },
  query: {
    alias: 'q',
    type: 'string',
    description:
      'regex for query (against the bookTitle, author & highlightedText)',
  },
  query_book_title: {
    alias: 'b',
    type: 'string',
    description: 'regex for query (against the bookTitle)',
  },
  query_author: {
    alias: 'a',
    type: 'string',
    description: 'regex for query (against the author)',
  },
  query_highlighted_text: {
    alias: 't',
    type: 'string',
    description: 'regex for query (against the highlightedText)',
  },
  sort: {
    alias: 's',
    type: 'boolean',
    description: 'sort by createdDate',
  },
  sort_descending: {
    alias: 'S',
    type: 'boolean',
    description: 'sort by createdDate, descending',
  },
};

const {argv} = require('yargs')
  .alias('help', 'h')
  .version(false)
  .options(argOptions);

const writeCompletionFile = () => {
  const fp = path.join(homedir, '.config/zsh/completions/_kbq');
  if (!fs.existsSync(path.dirname(fp))) {
    mkdirp.sync(path.dirname(fp));
  }
  if (!fs.existsSync(fp)) {
    let completionFile = `#compdef kbq\n\n_arguments`;

    for (const o in argOptions) {
      const item = argOptions[o];
      completionFile =
        completionFile +
        ` '-${item.alias}[${item.description.replace(
          "'",
          "''",
        )}]' '--${o}[${item.description.replace("'", "''")}]'`;
    }
    fs.writeFileSync(fp, completionFile);
  }
};

const processLineByLine = async function processLineByLine(filePath) {
  let currentClipping = getEmptyClip();
  const rli = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  let outputFields = allFields;
  let resultNumber = 0;
  let bookTitleMatch = null;
  let authorMatch = null;
  let highlightedTextMatch = null;
  const hasQueryArg =
    argv.query ||
    argv.query_book_title ||
    argv.query_author ||
    argv.query_highlighted_text;
  for await (const line of rli) {
    resultNumber++;
    if (line.includes('======')) {
      let outString = '';
      let isFirst = true;

      if (!currentClipping.highlightedText) {
        currentClipping.highlightedText = '';
      }
      if (argv.query_book_title || argv.query) {
        const regEx = new RegExp(argv.query || argv.query_book_title, 'i');
        bookTitleMatch = currentClipping.bookTitle.match(regEx);
      }
      if (argv.query_author || argv.query) {
        const regEx = new RegExp(argv.query || argv.query_author, 'i');
        authorMatch = currentClipping.author.match(regEx);
      }
      if (argv.query_highlighted_text || argv.query) {
        const regEx = new RegExp(
          argv.query || argv.query_highlighted_text,
          'i',
        );
        highlightedTextMatch = currentClipping.highlightedText.match(regEx);
      }
      const hasMatch = bookTitleMatch || authorMatch || highlightedTextMatch;
      if (hasQueryArg && !hasMatch) {
        currentClipping = getEmptyClip();
        continue;
      }
      for (const f of outputFields) {
        let renderedField = currentClipping[f];
        const currentChalkColor = chalkColors[f];
        if (f === '#') {
          renderedField = `${resultNumber}`;
        } else if (f === 'createdDate') {
          renderedField = moment(currentClipping.createdDate).format(
            'YYYY-MM-DD HH:mm',
          );
        } else if (f === 'bookTitle' && bookTitleMatch) {
          const beforeMatch = currentClipping[f].slice(0, bookTitleMatch.index);
          const match = bookTitleMatch[0];
          const afterMatch = currentClipping[f].slice(
            bookTitleMatch.index + match.length,
          );
          renderedField =
            currentChalkColor(beforeMatch) +
            chalk.black.bgYellowBright(match) +
            currentChalkColor(afterMatch);
        } else if (f === 'author' && authorMatch) {
          const beforeMatch = currentClipping[f].slice(0, authorMatch.index);
          const match = authorMatch[0];
          const afterMatch = currentClipping[f].slice(
            authorMatch.index + match.length,
          );
          renderedField =
            currentChalkColor(beforeMatch) +
            chalk.black.bgYellowBright(match) +
            currentChalkColor(afterMatch);
        } else if (f === 'highlightedText' && highlightedTextMatch) {
          const beforeMatch = currentClipping[f].slice(
            0,
            highlightedTextMatch.index,
          );
          const match = highlightedTextMatch[0];
          const afterMatch = currentClipping[f].slice(
            highlightedTextMatch.index + match.length,
          );
          renderedField =
            currentChalkColor(beforeMatch) +
            chalk.black.bgYellowBright(match) +
            currentChalkColor(afterMatch);
        }
        if (!isFirst) {
          outString = outString + chalk.gray(',');
        }
        outString =
          outString +
          `${chalk.gray('"')}${currentChalkColor(renderedField)}${chalk.gray(
            '"',
          )}`;
        isFirst = false;
      }
      console.log(outString);
      currentClipping = getEmptyClip();
    } else if (currentClipping.bookTitle === null) {
      const regExExtractTitleAndAuthor = /^(.*)(\()(.*)\)/;
      const matches = line.match(regExExtractTitleAndAuthor);
      currentClipping.bookTitle = matches[1].trim();
      currentClipping.author = matches[3].trim();
    } else if (currentClipping.pageStart === null) {
      const rxLocationAndDate = /^.* Location (.*?) \| Added on (.*)$/;
      const matches = line.match(rxLocationAndDate);
      if (!matches) {
        debugger;
      }
      currentClipping.pageStart = matches[1];
      if (currentClipping.pageStart.includes('-')) {
        const parts = currentClipping.pageStart.split('-');
        currentClipping.pageStart = parseInt(parts[0]);
        currentClipping.pageEnd = parseInt(parts[1]);
      } else {
        currentClipping.pageStart = parseInt(currentClipping.pageStart);
        currentClipping.pageEnd = currentClipping.pageStart;
      }
      currentClipping.createdDate = moment(matches[2], 'LLLL').toDate();
    } else if (line.trim() !== '') {
      currentClipping.highlightedText =
        (currentClipping.highlightedText || '') + line;
    }
  }
};

const debugging =
  typeof v8debug === 'object' ||
  /--debug|--inspect/.test(process.execArgv.join(' '));
if (debugging) {
  processLineByLine(myClippingPath).catch(console.error);
}

writeCompletionFile();

processLineByLine(myClippingPath).catch(console.error);
module.exports = () => {
  processLineByLine(myClippingPath).catch(console.error);
};
