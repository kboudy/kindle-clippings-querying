const readline = require("readline"),
  fs = require("fs"),
  path = require("path"),
  chalk = require("chalk"),
  homedir = require("os").homedir(),
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
const processLineByLine = async function processLineByLine(filePath) {
  let currentClipping = {
    bookTitle: null,
    author: null,
    pageStart: null,
    pageEnd: null,
    createdDate: null,
    highlightedText: null
  };
  const rli = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity
  });

  let outputFields = allFields;
  let resultNumber = 1;
  let isFirst = true;
  const bookTitleMatch = null;
  for await (const line of rli) {
    if (line.includes("======")) {
      const chalkColors = [
        chalk.blue,
        chalk.white,
        chalk.magenta,
        chalk.cyan,
        chalk.yellow,
        chalk.green
      ];
      let outString = "";
      for (const f of outputFields) {
        let renderedField = currentClipping[f];
        const currentChalkColor = chalkColors.pop();
        chalkColors.unshift(currentChalkColor); // keep colors rotating if need me
        if (f === "#") {
          renderedField = `${resultNumber}`;
        } else if (f === "createdDate") {
          renderedField = moment(currentClipping.createdDate).format(
            "YYYY-MM-DD HH:mm"
          );
        } else if (f === "bookTitle" && bookTitleMatch) {
          const beforeMatch = b[f].slice(0, bookTitleMatch.index);
          const match = bookTitleMatch[0];
          const afterMatch = b[f].slice(bookTitleMatch.index + match.length);
          renderedField =
            currentChalkColor(beforeMatch) +
            chalk.black.bgYellowBright(match) +
            currentChalkColor(afterMatch);
        }
        if (!isFirst) {
          outString = outString + chalk.gray(",");
        }
        isFirst = false;
        outString = outString + `"${currentChalkColor(renderedField)}"`;
      }
      console.log(outString);
      currentClipping = {
        bookTitle: null,
        author: null,
        pageStart: null,
        pageEnd: null,
        createdDate: null,
        highlightedText: null
      };
      resultNumber++;
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
};

processLineByLine(
  path.join(
    homedir,
    "Dropbox/app_config/kindle-bookmark-querying/My Clippings.txt"
  )
).catch(console.error);
