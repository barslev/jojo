var fs = require('fs'),
    path = require('path');

/**
 * jojo - 10 second blog engine for hackers (in javascript)
 * @param {Object<ExpressServer>} [app] App to write to
 * @param {Object} [options] Various options corresponding to jojo
 * @param {String} [options.baseRoute='/'] Route where the base file will be rendered
 * @param {String} [options.templateEngine='ejs'] Route where the base file will be rendered
 * @param {String} [options.templateDir='templates'] Directory to retrieve templates from
 * @param {String} [options.articleDir='articles'] Directory to retrieve articles from
 * @param {Function} [options.formatter='showdown'] Processor used for articles // TODO: name this proeprly
 * @returns {Object<ExpressServer>} Express server initiall passed or created with the proper routes
 */
function jojo(app, options) {
  // If the first argument is not a server
  if (!app || app._locals === undefined) {
    // Promote it as options and create a server
    options = app;
    app = require('express').createServer();
  }

  // Fallback options
  options = options || {};

  var baseRoute = options.baseRoute || '/',
      templateEngine = options.templateEngine || 'ejs',
      templateDir = options.templateDir || 'templates',
      articleDir = options.articleDir || 'articles',
      formatter = options.formatter;

  // If the formatter is not defined, fallback to showdown
  if (formatter === undefined) {
    // This is so wrong... on so many levels... =_=
    var tempThis = {};
    require('showdown').Showdown.converter.call(tempThis);
    formatter = tempThis.makeHtml;
  }

  // Read in all the files in the article directory
  var fileNames = fs.readdirSync(articleDir),
      articles = [];
  fileNames.forEach(function (fileName) {
    // Read in the article
    var filepath = path.join(articleDir, fileName),
        file = fs.readFileSync(filepath, 'utf8');

    // TODO: Watch file for changes?

    // TODO: This is what cloudhead uses but I am not too fond of it
    // Find where the JSON ends (denoted by a double line break)
    var lineBreakRegexp = /\n\r?\n/g;
    lineBreakRegexp.exec(file);
    var dblLineBreakIndex = lineBreakRegexp.lastIndex || file.length;

    // Break up the properties and content
    var propsStr = file.slice(0, dblLineBreakIndex),
        props = new Function('return ' + propsStr + ';')(),
        rawContent = file.slice(dblLineBreakIndex);

    // Render the content via the formatter
    var content = formatter(rawContent);

    // TODO: Generate and save article object -- don't forget date, summary, content = body
  });

  // TODO: Index page with articles
  // TODO: Restore config.callouts (config should not be a local variable?)

  // Return the server
  return app;
};

module.exports = jojo;