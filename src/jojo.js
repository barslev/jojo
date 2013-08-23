var fs = require('fs'),
    path = require('path'),
    async = require('async'),
    config = {};

// Attempt to grab the config file
try {
  config = require(path.join(process.cwd(), 'config.jojo.json'));
} catch (e) {
}

// Generate helper object for extension
function objExtend(baseObj, newObj) {
  var retObj = {};

  // Copy the properties from the base object
  Object.getOwnPropertyNames(baseObj).forEach(function (prop) {
    retObj[prop] = baseObj[prop];
  });

  // Copy the properties from the new object
  Object.getOwnPropertyNames(newObj).forEach(function (prop) {
    retObj[prop] = newObj[prop];
  });

  // Return the composition of the objects
  return retObj;
}

/**
 * jojo - 10 second blog engine for hackers (in javascript)
 * Intended to be use with an express server via .use()
 * @param {Object<ExpressRequest>} req
 * @param {Object<ExpressResponse>} res
 * @param {Function} next
 */
function jojo(req, res, next) {
  // Grab the url, jojoBase
  var url = req.url,
      app = req.app,
      basepath = app.settings['jojo basepath'] || '/';

  // If we are in the base route
  if (url === basepath) {
    // Generate an index page with articles
    return sendIndex(req, res, next);
  } else if (url.indexOf(basepath) !== -1) {
    // If we are viewing the index.xml, load it
    if (url.indexOf('index.xml') !== -1) {
      return sendRss(req, res, next);
    } else {
    // Otherwise, attempt to send an article
      return sendArticle(req, res, next);
    }
  }

  // Otherwise, call the next method
  next();
}

// Sugar method for creating a server
jojo.createServer = function () {
  // Create a server an express server
  var express = require('express'),
      server = express.createServer.apply(express, arguments);

  // Bind jojo to the server
  server.use(jojo);

  // Return the bound server
  return server;
};

// Expose the config object
jojo.config = config;

// Create an expose methods for basic jojo functions
function sendIndex(req, res, next) {
  var app = req.app,
      yoyo = new Yoyo(app),
      indexView = app.settings['jojo index view'] || 'pages/index';

  yoyo.readArticles(null, function (err, articles) {
    // If there is an error, log it and move to next fn
    if (err) {
      console.error(err);
      return next();
    }

    // Otherwise, render
    var renderObj = objExtend(jojo.config, {'articles': articles});
    res.render(indexView, renderObj);
  });
}
jojo.index = sendIndex;

function sendArticle(req, res, next) {
  var app = req.app,
      yoyo = new Yoyo(app),
      url = req.url,
      settings = app.settings,
      basepath = settings['jojo basepath'] || '/',
      articleView = settings['jojo article view'] || 'pages/article';

  yoyo.readArticles(null, function (err, articles) {
    // If there is an error, log it and move to next fn
    if (err) {
      console.error(err);
      return next();
    }

    // Try to find a matching article
    var articleUrl = url.slice(url.indexOf(basepath) + basepath.length),
        i = 0,
        len = articles.length,
        article,
        articleFound = false;
    for (; i < len; i++) {
      article = articles[i];

      // If it matches our article url, save it
      if (articleUrl.indexOf(article.url) !== -1) {
        articleFound = true;
        break;
      }
    }

    // If the article was found, use it
    if (articleFound) {
      // If there is an articleView, render through it
      var renderObj = objExtend(article, {'config': jojo.config});
      res.render(articleView, renderObj);
    } else {
      // Otherwise, call the next method
      next();
    }
  });
}
jojo.article = sendArticle;

function sendRss(req, res, next) {
  var app = req.app,
      yoyo = new Yoyo(app),
      rssView = app.settings['jojo rss view'] || 'xml';

  yoyo.readArticles(null, function (err, articles) {
    // If there is an error, log it and move to next fn
    if (err) {
      console.error(err);
      return next();
    }

    // Otherwise, render
    var renderObj = objExtend(jojo.config, {'layout': false, 'articles': articles});
    res.render(rssView, renderObj);
  });
}
jojo.rss = sendRss;

// State (and sanity) preserver for jojo
function Yoyo(app) {
  // Fallback app
  app = app || {'settings': {}};

  // Save app to this
  this.app = app;
}
Yoyo.prototype = {
  'readArticles': function (articleDir, callback) {
    var that = this,
        app = this.app,
        cwd = process.cwd();
    articleDir = articleDir || app.settings['jojo articles'] || path.join(cwd, 'articles');

    fs.readdir(articleDir, function (err, articles) {
      // If there is an error, log and callback with it
      if (err) {
        console.error('Article directory could not be read: ', articleDir);
        return callback(err);
      }

      // Otherwise, read in all of the articles
      async.map(articles, function (article, callback) {
        var articlePath = path.join(articleDir, article);
        that.readArticle(articlePath, callback);
      }, function (err, articles) {
        // If there is an error, callback with it
        if (err) {
          return callback(err);
        }

        // Otherwise, sort the articles
        articles.sort(function (articleA, articleB) {
          return articleB.rawDate - articleA.rawDate;
        });

        // and callback with them
        callback(null, articles);
      });
    });
  },
  'readArticle': function (articlePath, callback) {
    var that = this;
    fs.readFile(articlePath, 'utf8', function (err, article) {
      // If there was an error, log it
      if (err) {
        console.error('An article could not be read: ', articlePath);
        return callback(err);
      }

      // Otherwise, parse the article
      var parsedArticle = that.parseArticle(article);

      // Callback with the article
      callback(null, parsedArticle);
    });
  },
  'parseArticle': function (article) {
    var app = this.app,
        settings = app.settings,
        dataEngine = settings['jojo data parser'] || 'json',
        formatEngine = settings['jojo formatter'] || 'showdown',
        formatter = require(formatEngine),
        dataParser = dataEngine === 'json' ? JSON.parse : require(dataEngine);

    // If the engine is showdown, get the proper formatter
    if (formatEngine === 'showdown') {
      // This is so wrong... on so many levels... =_=
      var tempThis = {};
      formatter.Showdown.converter.call(tempThis);
      formatter = tempThis.makeHtml;
    }

    // This is what cloudhead uses but I am not too fond of it
    // Find where the JSON ends (denoted by a double line break)
    var dblLineBreakIndex = article.search(/\n\r?\n/g);

    // Fallback the dblLineBreakIndex
    if (dblLineBreakIndex === -1) {
      dblLineBreakIndex = article.length;
    }

    // Break up the properties and content
    var propsStr = article.slice(0, dblLineBreakIndex),
        props = new Function('return ' + propsStr + ';')(),
        rawContent = article.slice(dblLineBreakIndex);

    // Render the content via the formatter
    var content = formatter(rawContent),
        retObj = dataParser(propsStr);

    // Interpret date
    retObj.rawDate = new Date(retObj.date);

    // Save the content to the renderObj
    retObj.content = content;

    // Save the raw content for summary consumption
    retObj.rawContent = rawContent;

    // Generate a summary
    retObj.summary = retObj.summary || jojo.getSummary(retObj, formatter);

    // Fallback the url
    retObj.url = retObj.url || jojo.getUrl(retObj);

    // Return the parsed object
    return retObj;
  }
};

// Expose Yoyo via jojo
jojo.Yoyo = Yoyo;

// Create an overwritable helper function for generating article URLs
jojo.getUrl = function (article) {
  var urlParts = [],
      date = article.date;
  if (date) {
    urlParts.push(date.replace(/\//g, '-'));
  }
  urlParts.push(article.title.replace(/\s+/g, '-'));

  return urlParts.join('-').toLowerCase();
};

// Create an overwritable helper for generating summaries
function makeSummary(summaryLen, rawContent) {
  return function summaryFn (article, formatter) {
    var content = rawContent ? article.rawContent : article.content,
        spaceRegExp = /\s/g,
        index,
        lastIndex;

    while (true) {
      spaceRegExp.exec(content);
      index = spaceRegExp.lastIndex;

      if (index === -1 || index > summaryLen) {
        break;
      } else if (index === 0) {
        index = content.length;
        break;
      }

      lastIndex = index;
    }

    var summary = content.slice(0, lastIndex - 1);
    if (index > summaryLen) {
      summary += '...';
    }

    // If there is raw content, format this
    if (rawContent) {
      summary = formatter(summary);
    }

    return summary;
  }
}
jojo.makeSummary = makeSummary;
jojo.getSummary = makeSummary(150);

// Create helper methods for reading and parsing articles
var emptyYoyo = new Yoyo();
jojo.readArticles = function (articleDir, callback) {
  emptyYoyo.readArticles(articleDir, callback);
};
jojo.readArticle = function (articlePath, callback) {
  emptyYoyo.readArticle(articlePath, callback);
};
jojo.parseArticle = function (article) {
  emptyYoyo.parseArticle(article);
};

// Export jojo
module.exports = jojo;