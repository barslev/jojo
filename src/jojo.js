// Load in dependencies
var fs = require('fs'),
    express = require('express'),
    jsonContentDemux = require('json-content-demux'),
    marked = require('marked');

// Class to handle storing articles
function ArticleCollection(options) {
  // Create placeholder for articles
  this._articles = [];

  // Fallback and save options for later
  this.options = options || {};
}
ArticleCollection.parseArticle = function (article, options) {
  // Fallback options
  options = options || {};

  // Demux content
  var demuxer = options.dataParser || jsonContentDemux,
      demuxedArticle = demuxer(article),
      data = demuxedArticle.json,
      markup = demuxedArticle.content;

  // Render the content
  var formatter = options.formatter || marked,
      content = formatter(markup);

  // Add information to data
  var retObj = data;
  retObj.rawDate = retObj.date;
  retObj.date = new Date(retObj.date);
  retObj.content = content;
  retObj.rawContent = markup;

  // If there is a summary, parse it via the formatter
  if (data.summary) {
    retObj.summary = formatter(data.summary);
  }

  // Return the data
  return retObj;
};
ArticleCollection.prototype = {
  // Add a new article from plaintext
  addArticle: function (text) {
    // Parse and add the particle to our list
    var article = ArticleCollection.parseArticle(text, this.options);
    this._articles.push(article);
  },
  // Add a new article based on file path
  addArticleFromFile: function (filepath) {
    // Read and add the article
    var text = fs.readFileSync(filepath, 'utf8');
    this.addArticle(text, this.options);
  },
  // Return array of articles
  articles: function () {
    return this._articles;
  }
};

// Define our jojo middleware
function jojo(config) {
  // Create a new server
  var app = express();

  // Fallback options
  config = config || {};

  // Create a new collection for our articles
  var collection = new ArticleCollection(config);

  // Locate and add articles from config
  var articleDir = config.articles || process.cwd() + '/articles',
      articleFiles = fs.readdirSync(articleDir);
  articleFiles.forEach(function addArticleFn (articleFile) {
    var articlePath = articleDir + '/' + articleFile;
    collection.addArticleFromFile(articlePath);
  });

  // Grab the articles
  var articles = collection.articles();
  console.log(articles);
}
module.exports = jojo;