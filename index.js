const readline = require("readline"),
  fs = require("fs"),
  path = require("path"),
  chalk = require("chalk"),
  util = require("util"),
  exec = util.promisify(require("child_process").exec),
  homedir = require("os").homedir(),
  _ = require("lodash"),
  moment = require("moment");

const allFields = [
  "#",
  "bookTitle",
  "author",
  "pageStart",
  "pageEnd",
  "createdDate",
  "highlightedText"
];

const chalkColors = {
  "#": chalk.blue,
  bookTitle: chalk.yellow,
  author: chalk.magenta,
  pageStart: chalk.cyan,
  pageEnd: chalk.cyan,
  createdDate: chalk.green,
  highlightedText: chalk.white
};

const getEmptyClip = () => {
  return {
    bookTitle: null,
    author: null,
    pageStart: null,
    pageEnd: null,
    createdDate: null,
    highlightedText: null
  };
};

const configPath = path.join(
  homedir,
  ".config/kindle-clippings-querying/config.json"
);
if (!fs.existsSync(path.dirname(configPath))) {
  fs.mkdirSync(path.dirname(configPath));
}
let config = {
  // converted epub files will be stored in this dir
  epubOutputDir: "/data/kindleClippings_epubFiles",
  // "My Clippings.txt" will be copied from the kindle to this location
  myClippingsLocalPath: path.join(
    homedir,
    "Dropbox/app_config/kindle-clippings-querying/My Clippings.txt"
  ),
  kindleDocumentsDir: `/media/${
    require("os").userInfo().username
  }/Kindle/Documents`
};
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(configPath, JSON.stringify(config), "utf8");
} else {
  config = JSON.parse(fs.readFileSync(configPath));
}

const kindleClippingsPath = path.join(
  config.kindleDocumentsDir,
  "My Clippings.txt"
);

const argOptions = {
  fields: {
    alias: "f",
    type: "string",
    description: `Comma-delimited field names (${allFields.join(",")})`
  },
  copy: {
    alias: "c",
    type: "boolean",
    description: `Copy the "My Clippings.txt" file from your Kindle`
  },
  query: {
    alias: "q",
    type: "string",
    description:
      "regex for query (against the bookTitle, author & highlightedText)"
  },
  query_book_title: {
    alias: "b",
    type: "string",
    description: "regex for query (against the bookTitle)"
  },
  query_author: {
    alias: "a",
    type: "string",
    description: "regex for query (against the author)"
  },
  query_highlighted_text: {
    alias: "t",
    type: "string",
    description: "regex for query (against the highlightedText)"
  },
  sort: {
    alias: "s",
    type: "boolean",
    description: "sort by createdDate"
  },
  sort_descending: {
    alias: "S",
    type: "boolean",
    description: "sort by createdDate, descending"
  }
};

const { argv } = require("yargs")
  .alias("help", "h")
  .version(false)
  .options(argOptions);

const writeCompletionFile = () => {
  const fp = path.join(homedir, ".config/zsh/completions/_kcq");
  if (!fs.existsSync(path.dirname(fp))) {
    mkdirp.sync(path.dirname(fp));
  }
  if (!fs.existsSync(fp)) {
    let completionFile = `#compdef kcq\n\n_arguments`;

    for (const o in argOptions) {
      const item = argOptions[o];
      completionFile =
        completionFile +
        ` '-${item.alias}[${item.description.replace(
          "'",
          "''"
        )}]' '--${o}[${item.description.replace("'", "''")}]'`;
    }
    fs.writeFileSync(fp, completionFile);
  }
};

const processLineByLine = async filePath => {
  const allTitles = [];
  const rli = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity
  });

  const outputFields = [];
  for (const f of (argv.fields || allFields.join(","))
    .split(",")
    .map(f => f.trim())) {
    const matchingField = allFields.filter(
      fld => fld.toLowerCase() === f.toLowerCase()
    );
    if (matchingField.length > 0) {
      outputFields.push(matchingField[0]);
    }
  }
  let resultNumber = 0;
  let bookTitleMatch = null;
  let authorMatch = null;
  let highlightedTextMatch = null;
  const hasQueryArg =
    argv.query ||
    argv.query_book_title ||
    argv.query_author ||
    argv.query_highlighted_text;
  let allClippings = [];
  let currentClipping = getEmptyClip();
  for await (const line of rli) {
    if (line.includes("======")) {
      allClippings.push(currentClipping);
      currentClipping = getEmptyClip();
    } else if (currentClipping.bookTitle === null) {
      const regExExtractTitleAndAuthor = /^(.*)(\()(.*)\)/;
      const matches = line.match(regExExtractTitleAndAuthor);
      currentClipping.bookTitle = matches[1].trim();
      currentClipping.author = matches[3].trim();

      if (!allTitles.includes(currentClipping.bookTitle)) {
        allTitles.push(currentClipping.bookTitle);
      }
    } else if (currentClipping.pageStart === null) {
      const rxLocationAndDate = /^.* Location (.*?) \| Added on (.*)$/;
      const matches = line.match(rxLocationAndDate);
      if (!matches) {
        debugger;
      }
      currentClipping.pageStart = matches[1];
      if (currentClipping.pageStart.includes("-")) {
        const parts = currentClipping.pageStart.split("-");
        currentClipping.pageStart = parseInt(parts[0]);
        currentClipping.pageEnd = parseInt(parts[1]);
      } else {
        currentClipping.pageStart = parseInt(currentClipping.pageStart);
        currentClipping.pageEnd = currentClipping.pageStart;
      }
      currentClipping.createdDate = moment(matches[2], "LLLL").toDate();
    } else if (line.trim() !== "") {
      currentClipping.highlightedText =
        (currentClipping.highlightedText || "") + line;
    }
  }
  if (argv.sort_descending) {
    allClippings = _.orderBy(allClippings, c => -c.createdDate);
  } else {
    allClippings = _.orderBy(allClippings, c => c.createdDate);
  }
  for (const c of allClippings) {
    let outString = "";
    let isFirst = true;

    if (!c.highlightedText) {
      c.highlightedText = "";
    }
    if (argv.query_book_title || argv.query) {
      const regEx = new RegExp(argv.query || argv.query_book_title, "i");
      bookTitleMatch = c.bookTitle.match(regEx);
    }
    if (argv.query_author || argv.query) {
      const regEx = new RegExp(argv.query || argv.query_author, "i");
      authorMatch = c.author.match(regEx);
    }
    if (argv.query_highlighted_text || argv.query) {
      const regEx = new RegExp(argv.query || argv.query_highlighted_text, "i");
      highlightedTextMatch = c.highlightedText.match(regEx);
    }
    const hasMatch = bookTitleMatch || authorMatch || highlightedTextMatch;
    if (hasQueryArg && !hasMatch) {
      continue;
    }
    for (const f of outputFields) {
      let renderedField = c[f];
      const currentChalkColor = chalkColors[f];
      if (f === "#") {
        renderedField = `${resultNumber}`;
        resultNumber++;
      } else if (f === "createdDate") {
        renderedField = moment(c.createdDate).format("YYYY-MM-DD HH:mm");
      } else if (f === "bookTitle" && bookTitleMatch) {
        const beforeMatch = c[f].slice(0, bookTitleMatch.index);
        const match = bookTitleMatch[0];
        const afterMatch = c[f].slice(bookTitleMatch.index + match.length);
        renderedField =
          currentChalkColor(beforeMatch) +
          chalk.black.bgYellowBright(match) +
          currentChalkColor(afterMatch);
      } else if (f === "author" && authorMatch) {
        const beforeMatch = c[f].slice(0, authorMatch.index);
        const match = authorMatch[0];
        const afterMatch = c[f].slice(authorMatch.index + match.length);
        renderedField =
          currentChalkColor(beforeMatch) +
          chalk.black.bgYellowBright(match) +
          currentChalkColor(afterMatch);
      } else if (f === "highlightedText" && highlightedTextMatch) {
        const beforeMatch = c[f].slice(0, highlightedTextMatch.index);
        const match = highlightedTextMatch[0];
        const afterMatch = c[f].slice(
          highlightedTextMatch.index + match.length
        );
        renderedField =
          currentChalkColor(beforeMatch) +
          chalk.black.bgYellowBright(match) +
          currentChalkColor(afterMatch);
      }
      if (!isFirst) {
        outString = outString + chalk.gray(",");
      }
      outString =
        outString +
        `${chalk.gray('"')}${currentChalkColor(renderedField)}${chalk.gray(
          '"'
        )}`;
      isFirst = false;
    }
    console.log(outString);
  }
  return allTitles;
};

const alphaNumericOnly = text => {
  return text.replace(/[^a-z0-9]+/gi, "");
};

const findMatchingFile = (bookTitle, ebookFiles) => {
  const strippedBookTitle = alphaNumericOnly(bookTitle)
    .slice(0, 100)
    .toLowerCase();
  const matches = ebookFiles.filter(b => {
    if (!b.includes("_")) {
      return false;
    }
    const bCropped = b.substring(0, b.lastIndexOf("_"));
    const bStripped = alphaNumericOnly(bCropped)
      .slice(0, 100)
      .toLowerCase();
    return bStripped === strippedBookTitle;
  });
  if (matches.length) {
    return matches[0];
  }
  return null;
};

const executeAll = async () => {
  console.log(
    `Copying ${chalk.yellow(kindleClippingsPath)} to ${chalk.green(
      config.myClippingsLocalPath
    )}`
  );
  fs.copyFileSync(kindleClippingsPath, config.myClippingsLocalPath);

  console.log("Importing clippings...");
  let allTitles = await processLineByLine(config.myClippingsLocalPath).catch(
    console.error
  );
  /*
  allTitles.sort();
  console.log("Copying & converting ebooks...");
  const allDocFiles = fs.readdirSync(config.kindleDocumentsDir);
  const azwFiles = allDocFiles.filter(f => f.match(/\.azw$/));
  const missingTitles = [];
  for (const t of allTitles) {
    const m = findMatchingFile(t, azwFiles);
    if (m) {
      const mFullPath = path.join(config.kindleDocumentsDir, m);
      const destEpubFile = path.join(config.epubOutputDir, `${t}.epub`);
      if (!fs.existsSync(destEpubFile)) {
        console.log(
          `Converting ${chalk.yellow(t)} - output file: ${chalk.green(
            destEpubFile
          )}`
        );

        try {
          const { stdout, stderr } = await exec(
            `ebook-convert "${mFullPath}" "${destEpubFile}"`
          );
        } catch (err) {
          console.log(err.message);
        }
      }
    } else {
      missingTitles.push(t);
    }
  }
  */
};

const debugging =
  typeof v8debug === "object" ||
  /--debug|--inspect/.test(process.execArgv.join(" "));
if (debugging) {
  console.log("Debugger session");
  (async () => {
    await executeAll();
  })();
}
writeCompletionFile();

module.exports = () => {
  if (argv.copy) {
    if (!fs.existsSync(config.myClippingsLocalPath)) {
      console.log(
        chalk.red(
          `Couldn't find the Kindle clipping file (make sure you've mounted it by running nautilus): ${chalk.white(
            config.myClippingsLocalPath
          )}`
        )
      );
    } else {
      console.log(
        `Copying ${chalk.yellow(kindleClippingsPath)} to ${chalk.green(
          config.myClippingsLocalPath
        )}`
      );
      fs.copyFileSync(kindleClippingsPath, config.myClippingsLocalPath);
    }
  } else {
    (async () => {
      await executeAll();
    })();
  }
};
