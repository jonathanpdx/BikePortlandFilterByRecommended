"use strict";

// ==UserScript==
// @name           BikePortlandFilterByRecommended
// @namespace      http://namespace.kinobe.com/greasemonkey/
// @description    Greasemonkey script that allows the user to select which
// bikeportland.org comments they wish to view based on how many times it has
// been recommended.
// @include        /^https?://bikeportland\.org/.*$/
// @include        /^https?://bp/Sites/bikeportland/index.html$/
// @version        1.6
// @grant          GM_addStyle
// ==/UserScript==

/*

 This copyright section and all credits in the script must be included in
 modifications or redistributions of this script.

 BikePortlandFilterByRecommended is Copyright (c) 2017, Jonathan Gordon
 BikePortlandFilterByRecommended is licensed under a Creative Commons
 Attribution-Share Alike 3.0 Unported License
 License information is available here:
 http://creativecommons.org/licenses/by-sa/3.0/

 BikePortland is owned by PedalTown Media Inc.
 BikePortlandFilterByRecommended is not related to or endorsed by PedalTown
 Media Inc. in any way.

 */

/*
 This script borrows from Jimmy Woods' Metafilter favorite posts filter script
 http://userscripts.org/scripts/show/75332

 Also from Jordan Reiter's Metafilter MultiFavorited Multiwidth - November
 Experiment
 http://userscripts.org/scripts/show/61012

 Version 1.4/1.5
 - Updated to work with https

 Version 1.3
 - Enhancements

 Version 1.1
 - Added additional recommended styling on left, ala the Metafilter
 MultiFavorited Multiwidth script.

 Version 1.0
 - Initial Release.

 */

/* global
 GM_addStyle, Map, HTMLCollection, window
 */


/* jshint
 globalstrict: true, browser:true, devel: true, esnext: true, newcap: false
 */


let foreach = function(fn) {
  // eslint-disable-next-line no-invalid-this
  let arrayLike = this;
  let len = arrayLike.length;
  let i;
  for (i = 0; i < len; ++i) {
    fn(arrayLike[i], i);
  }
};

Object.defineProperty(Array.prototype, "customForEach", {
  enumerable: false,
  value: foreach,
});

Object.defineProperty(HTMLCollection.prototype, "customForEach", {
  enumerable: false,
  value: foreach,
});

Object.defineProperty(Map.prototype, "getOrElse", {
  enumerable: false,
  value: function(key, value) {
    return this.has(key) ? this.get(key) : value;
  },
});


// Enum-like variable to help with logging via Logger
// Not serializable. If we want to do that, consider this slight modification
// https://stijndewitt.com/2014/01/26/enums-in-javascript/
let LogLevelEnum = {
  DEBUG: {value: 0, name: "Debug"},
  INFO: {value: 1, name: "Info"},
  WARN: {value: 2, name: "Warn"},
  ERROR: {value: 3, name: "Error"},
};

let Config = {
  selected_row: null, // Reference to the currently selected div in the chart
  chart_bg_color: "#CCC",   // Background color for the chart rows
  chart_selected_color: "#F2A175",     // Selected color for the chart row.
  hover_color: "#F2A175",     // Hover color for the chart row.
  favorite_color: "#ff7617",     // Main color for favorites.
  posts: [],        // Stores info about each post
  numRecsCountMap: new Map([[0, 0]]),
  maxFavorites: 0,   // Highest favorite count so far.
  logLevel: LogLevelEnum.DEBUG,   // What level should we log at?
  doLog: true,  // Should we log messages?
  row_prefix: "summary_id_", // Prefix ID for each row in chart
  chart_id: "chart_id", // ID for the chart
  chart_link_id: "chart_link_id", // ID for link to chart
};


/**
 * ----------------------------------
 * Logger
 * ----------------------------------
 * Simple console logger with log levels
 */
let Logger = {

  log: function(message, logLevelEnum) {
    logLevelEnum = logLevelEnum || LogLevelEnum.INFO;

    if (Config.doLog && logLevelEnum.value >= Config.logLevel.value) {
      console.log(logLevelEnum.name + ": " + message);
    }
  }, debug: function(message) {
    Logger.log(message, LogLevelEnum.DEBUG);
  }, info: function(message) {
    Logger.log(message, LogLevelEnum.INFO);
  }, warn: function(message) {
    Logger.log(message, LogLevelEnum.WARN);
  }, error: function(message) {
    Logger.log(message, LogLevelEnum.ERROR);
  },
};

/**
 * ----------------------------------
 * Util
 * ----------------------------------
 * Various utility functions
 */
let Util = {
  /**
   * Returns an array of DOM elements for a given tag and class
   *
   * @param {string} tag Name of the tag element to search on (e.g., "span",
   * "div", "ul", etc.)
   * @param {string} className Name of the css class to search for
   * @param {Node} from DOM element to search under. If not specified, document
   * is used
   * @return {Array} Found nodes (if any)
   */
  getNodesFromTagWithClass: function(tag, className, from) {
    let path = "//" + tag +
      "[contains(concat(' ', normalize-space(@class), ' '), ' " + className +
      " ')]";
    return Util.getNodes(path, from);
  },

  /**
   * Returns an array of DOM elements that match a given XPath expression.
   *
   * @param {string} path Xpath expression to search for
   * @param {Node} from DOM element to search under. If not specified, document
   * is used
   * @return {Array} Found nodes (if any)
   */
  getNodes: function(path, from) {
    from = from || document;

    let node;
    let nodes = [];
    let iter = document.evaluate(path, from, null, XPathResult.ANY_TYPE, null);
    while ((node = iter.iterateNext()) !== null) {
      nodes.push(node);
    }
    return nodes;
  },

  /**
   * Deletes a DOM element
   * @param {Node} element DOM element to remove
   * @return {Node} element the removed element
   */
  removeElement: function(element) {
    return element.parentNode.removeChild(element);
  },

  /**
   * Returns y position of given DOM element
   * @param {Node} element DOM element to find position
   * @return {number} y position of given DOM element
   */
  findPos: function(element) {
    let currentTop = 0;
    if (element.offsetParent) {
      do {
        currentTop += element.offsetTop;
      } while ((element = element.offsetParent) !== null);
    }
    return currentTop;
  },

  /**
   * Tests whether DOM element has a given class
   * @param {Node} element The DOM element to test
   * @param {string} classname The name of the class to check
   * @return {boolean} true if class name is found, false otherwise.
   */
  elementHasClass: function(element, classname) {
    return element !== null && element.classList.contains(classname);
  },

  /**
   * Gets or creates a DOM element with a particular id
   * @param {string} tagName The type of DOM element (e.g., "span", "div", etc.)
   * @param {string} id The id of the element to get/create
   * @return {Node} The element, either created or found.
   */
  getOrCreateElementWithId: function(tagName, id) {
    let element = document.getElementById(id);
    if (null !== element) {
      return element;
    }

    element = document.createElement(tagName);
    element.id = id;
    return element;
  },

  /**
   *
   * @param className
   * @param node
   * @returns {Array}
   */
  legacyGetElementsByClassName: function(node, className) {
      if (node === null) {
        node = document;
      }
      let classElements = [];
      let els = node.getElementsByTagName("*");
      let elsLen = els.length;
      let pattern = new RegExp("(^|\\s)" + className + "(\\s|$)");
      let i;
      let j;
      Logger.debug("Total elements: " + els.length);
      Logger.debug("Looking for" + className);

      for (i = 0, j = 0; i < elsLen; i++) {
        let elsClassName = els[i].className;
        if ("" !== elsClassName) {
          Logger.debug("Class of element: " + elsClassName);
        }
        if (pattern.test(elsClassName)) {
          classElements[j] = els[i];
          j++;
        }
      }
      return classElements;
    },

  /**
   * Returns
   * @param node
   * @param classname
   * @returns {*}
   */
  getElementsByClassName: function(node, classname) {
    if (node.getElementsByClassName) { // use native implementation if available
      Logger.debug("Using native implementation...");
      return node.getElementsByClassName(classname);
    } else {
      return Util.legacyGetElementsByClassName(node, classname);
    }
  },

};


let simulateClickShow = function(count) {
  document.getElementById(Config.row_prefix + count).click();
  highlightClick(count);
};

/*
 * Event handler for when user clicks on a row
 */
let filterPosts = function(event) {
  Logger.debug("Start filterPosts");

  // Get the clicked element
  let row_div = event.target;

  while (!Util.elementHasClass(row_div, "chart_row")) {
    Logger.debug("Getting parent of div: " + row_div.innerHTML);
    row_div = row_div.parentNode;
  }

  // Determine its ID and extract the number from it.
  let filter_count = row_div.dataset.count;
  Logger.debug("filter_count is: " + filter_count);

  // Hide/unhide all posts that don't match the chosen fav count.
  Config.posts.customForEach(function(post, j) {
    let isShowing = (post.div.style.display !== "none");
    let doShow = (post.recommendedCount >= filter_count);
    if (doShow !== isShowing) {
      post.div.style.display = (doShow ? "" : "none");
    }
  });


  // Reset the color of the previous row to be clicked on.
  if (Config.selected_row !== null) {
    Config.selected_row.style.background = Config.chart_bg_color;
  }
  // Set the color of the row we just clicked on
  row_div.style.background = Config.chart_selected_color;
  Config.selected_row = row_div;

  highlightClick(filter_count);

  Logger.debug("End filterPosts");
};

// ---------------------------


// a function that loads jQuery and calls a callback function when jQuery has
// finished loading
let addJQuery = function(callback) {
  let script = document.createElement("script");
  script.setAttribute("src", "http://ajax.googleapis.com/ajax/libs/jquery/1.6.4/jquery.min.js");
  script.addEventListener("load", function() {
    let script = document.createElement("script");
    script.textContent = "(" + callback.toString() + ")();";
    document.body.appendChild(script);
  }, false);
  document.body.appendChild(script);
};

function highlightClick(count) {
  Util.getNodesFromTagWithClass("span", "click_count").forEach(function(val) {
    let cur_count = val.dataset.count;

    if (count === cur_count) {
      val.classList.remove("is_not_selected");
      val.classList.add("is_selected");
    } else {
      val.classList.add("is_not_selected");
      val.classList.remove("is_selected");
    }
  });
}

let captureShowClick = function(e) {
  let click_target = e.target;
  while (!(/SPAN/i).test(click_target.tagName)) {
    click_target = click_target.parentNode;
  }
  let count = click_target.dataset.count;

  Logger.debug("Count is: " + count);
  Logger.debug("click_target is: " + click_target);
  let prevPos = Util.findPos(click_target);
  Logger.debug("click_target pos before: " + prevPos);

  let diff = prevPos - window.pageYOffset;

  simulateClickShow(count);

  let newPos = Util.findPos(click_target);
  Logger.debug("click_target pos after: " + newPos);

  window.scrollTo(0, newPos - diff);
  return false;
};

// renaming function to comply with eslint "new-cap" rule
let gm_addStyle = GM_addStyle;

let addCustomStyles = function() {
  // make sure we have the fonts we need
  let link = document.createElement("link");
  link.type = "text/css";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css?family=Open+Sans:light";
  document.head.appendChild(link);

  gm_addStyle("#comments { margin-bottom: 1em; }");

  gm_addStyle("#" + Config.chart_id + ",.chart_link, .chart_title, .chart, " +
    ".heading, .chart_right,.chart_row, .comments, .favs, .all_favs, " +
    ".click_count, .show {" +
    "font-weight: lighter !important;" +
    "font-family: 'Open Sans' !important;" +
    "}");

  gm_addStyle(".chart_link {" +
    "font: 16px !important;" +
    "color: " + Config.favorite_color + " !important;" +
    "}");

  gm_addStyle("span.is_not_selected a {" +
    "font-weight: lighter !important;" +
    "color: " + Config.hover_color + " !important;" +
    "}");

  gm_addStyle("span.is_selected a {" +
    "font-weight: normal !important;" +
    "color: " + Config.favorite_color + " !important;" +
    "}");

  gm_addStyle("#" + Config.chart_id + " {" +
    "white-space: nowrap !important;" +
    "padding: 3px 0 !important;" +
    "}");

  gm_addStyle(".chart_title {" +
    "padding: 3px 0 !important;" +
    "margin: 0px 4px !important;" +
    "font-size: 200% !important;" +
    "color: " + Config.favorite_color + " !important;" +
    "}");

  gm_addStyle(".chart {" +
    "background-color: " + Config.chart_bg_color + " !important;" +
    "width: 90% !important;" +
    "font: 14px !important;" +
    "margin: 0px 4px !important;" +
    "color: black !important;" +
    "border:1px solid white !important;" +
    "border-collapse:collapse !important;" +
    "}");

  gm_addStyle(".comments {" +
    "margin-left: 1em !important;" +
    "float: left !important;" +
    "width: 10% !important;" +
    "}");

  gm_addStyle(".favs, .chart_right, .all_favs {" +
    "float: left !important;" +
    "margin-right: 4px !important;" +
    "padding-left: 4px !important;" +
    "text-align: left !important;" +
    "}");

  gm_addStyle(".favs {" +
    "background-color: " + Config.favorite_color + " !important;" +
    "color: white !important;" +
    "}");

  gm_addStyle(".chart_right {" +
    "font-size: 160% !important;" +
    "}");

  gm_addStyle(".chart_row, .heading {" +
    "display: block !important;" +
    "padding: 3px 0px !important;" +
    "margin-bottom: 6px !important;" +
    "}");

  gm_addStyle(".chart_row:hover {" +
    "background-color: " + Config.hover_color + " !important;" +
    "}");

  gm_addStyle(".comment_highlight {" +
    "border-top: 0px !important;" +
    "border-bottom: 0px !important;" +
    "padding-left: 5px !important;" +
    "}");

  gm_addStyle(".clearfix:after {" +
    "content: '.' !important;" +
    "display: block !important;" +
    "height: 0 !important;" +
    "clear: both !important;" +
    "visibility: hidden !important;" +
    "}");
};

let processPosts = function() {
  Config.posts.length = 0;
  Config.numRecsCountMap.clear();

  // Get posts and compile them into array
  let id_re = /^div\-comment\-(\d+)$/;
  let comment_divs = Util.getNodesFromTagWithClass("div", "comment-body", null);

  comment_divs.forEach(function(comment_div) {
    let comment_div_id = comment_div.id;

    // we ignore the reply comment div, which doesn't have an id
    if (comment_div_id === undefined || !id_re.test(comment_div_id)) {
      Logger.debug("Invalid ID found for comment: " + comment_div_id);
      return;
    }

    let id_num = id_re.exec(comment_div_id)[1];
    let recommended_span = document.getElementById("karma-" + id_num + "-up");
    let recommended_text = recommended_span.textContent;
    let recommendedCount = parseInt(recommended_text);

    let numComments = Config.numRecsCountMap.getOrElse(recommendedCount, 0) + 1;
    Config.numRecsCountMap.set(recommendedCount, numComments);

    Config.maxFavorites = Math.max(recommendedCount, Config.maxFavorites);
    Config.posts.push({
      "div": comment_div,
      "recommendedCount": recommendedCount,
      "id_num": id_num,
    });
  });
};

let testChange = function(event) {
  let element = document.getElementById("mytestspantarget");
  element.innerHTML = parseInt(element.innerHTML) + 1;
};

let modifyPosts = function() {
  Config.posts.customForEach(function(post, j) {
    // we only highlight 3 and above
    if (post.recommendedCount > 2) {
      let size = (Math.round(post.recommendedCount / 2) + 1);
      let border_left = size + "px solid " + Config.favorite_color;
      post.div.style.setProperty("border-left", border_left, "important");

      // add the highlight class if it does not already exist
      if (!Util.elementHasClass(post.div, "comment_highlight")) {
        post.div.class += " comment_highlight";
      }
    }

    let rec_span = document.getElementById("karma-" + post.id_num + "-up");
    let show_span_id = post.id_num + "_show";
    let show_span = Util.getOrCreateElementWithId("span", show_span_id);
    show_span.className = "show";
    show_span.innerHTML = "&nbsp;Show:&nbsp;";

    let all_span = Util.getOrCreateElementWithId("span", post.id_num + "_all");
    if (null === all_span.parentNode) {
      all_span.className = "click_count";
      all_span.dataset.count = 0;
      all_span.innerHTML = "&nbsp;<a>All</a>";
      rec_span.parentNode.insertBefore(all_span, rec_span.nextSibling);
    }

    if (post.recommendedCount > 0) {
      let count_span_id = post.id_num + "_count";
      let count_span = Util.getOrCreateElementWithId("span", count_span_id);
      count_span.className = "click_count";
      count_span.dataset.count = post.recommendedCount;

      let top_count = Array.from(Config.numRecsCountMap.entries()).
        filter(function(entry) {
        return entry[0] >= post.recommendedCount;
      }).reduce(function(total, entry) {
        return total + entry[1];
      }, 0);

      count_span.innerHTML = "&nbsp;<a>Top " +top_count +
        " recommendations</a>&nbsp;|";

      if (null === count_span.parentNode) {
        rec_span.parentNode.insertBefore(count_span, rec_span.nextSibling);
      }
    }

    if (null === show_span.parentNode) {
      rec_span.parentNode.insertBefore(show_span, rec_span.nextSibling);
    }
  });
};

/**
 * Generates the chart at the top of the page
 * @return void
 */
let drawChart = function() {
  Logger.debug("Creating chart for total counts: " + Config.numRecsCountMap);

  let chart_div = Util.getOrCreateElementWithId("div", "chart_div_parent_id");
  let data_rows_html = "<div class='chart'>";
  let commentSum = 0;
  let keys = Array.from(Config.numRecsCountMap.keys());

  // we want a descending sort
  keys.sort(function(a, b) {
    return b - a;
  });

  data_rows_html += "<div class='heading clearfix'>" +
    "<div class='comments'>&nbsp;</div>" +
    "<div class='chart_right' style='width: 80%;'>" +
    "Minimum # of recommendations</div>" +
    "</div>";

  keys.customForEach(function(key, i) {
    commentSum += Config.numRecsCountMap.get(key);

    let recommendedWidthSize = (Math.round((key / Config.maxFavorites) * 80));

    let comment_count_label = key === 0 ? "All " : "Top ";
    let num_recs_style = key === 0 ? "all_favs" : "favs";
    data_rows_html += "<div id='" + Config.row_prefix + key +
      "' class='chart_row clearfix' data-count='" + key + "'>" +
      "<div class='comments'>" + comment_count_label + commentSum + "</div>" +
      "<div class='" + num_recs_style + "' style='width: " +
      recommendedWidthSize + "%;'>" + key + "</div>" +
      "</div>";
  });

  // Insert table into page
  chart_div.innerHTML = "<div id='" + Config.chart_id + "' class='clearfix'>" +
    "<span class='chart_title'>Most Popular Comments</span>" +
    "</div>" +
    data_rows_html;

  let page_div = document.getElementById("comments");
  page_div.insertBefore(chart_div, page_div.firstChild);
};

let addEventListeners = function() {
  Util.getNodesFromTagWithClass("div", "chart_row").customForEach(
    function(val, i) {
    val.addEventListener("click", filterPosts, false);
  });
};

let initializeEventListeners = function() {
  // Add the event listeners.
  document.addEventListener("keydown", function(e) {
    // pressed alt+g
    if (e.keyCode === 71 &&
      !e.shiftKey &&
      !e.ctrlKey &&
      e.altKey &&
      !e.metaKey) {
      simulateClickShow(0);
    }

    // pressed alt+c
    if (e.keyCode === 67 &&
      !e.shiftKey &&
      !e.ctrlKey &&
      e.altKey &&
      !e.metaKey) {
      document.getElementById(Config.chart_link_id).click();
    }
  }, false);

  Util.getElementsByClassName(document, "click_count").customForEach(
    function(val, i) {
    val.addEventListener("click", captureShowClick, false);
  });

  let element = document.getElementById("mytestspan");
  element.addEventListener("click", testChange, false);

  // create an observer instance
  let observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      Logger.info("Mutation is: " + mutation);

      processPosts();
      modifyPosts();
      drawChart();
      addEventListeners();

      let key = Config.selected_row.dataset.count
        ;
      if (!Config.numRecsCountMap.has(key)) {
        let keys = Array.from(Config.numRecsCountMap.keys());

        // we want a descending sort
        keys.sort(function(a, b) {
          return b - a;
        });

        keys.some(function(val) {
          if (val <= key) {
            key = val;
            return true;
          }
        });
      }

      simulateClickShow(key);
    });
  });

  // configuration of the observer:
  let config = {attributes: false, childList: true, characterData: false};

  Config.posts.customForEach(function(post, j) {
    let karma_id = "karma-" + post.id_num + "-up";
    observer.observe(document.getElementById(karma_id), config);
  });

  // pass in the target node, as well as the observer options
  observer.observe(document.getElementById("mytestspantarget"), config);
};

let init = function() {
  Logger.info("Starting init() for BikePortlandFilterByRecommended script...");

  // if we can't find comments, it's probably because this is being called for
  // a page we haven't excluded
  if (undefined === document.getElementById("comments")) {
    Logger.info("No comments founds. Exiting.");
    return;
  }

  // Create a link to the chart
  let entrytext_div = Util.getNodesFromTagWithClass("div", "entrytext")[0];
  let chart_link_div = document.createElement("div");
  chart_link_div.className = "chart_link";
  chart_link_div.innerHTML = "<a href='#" + Config.chart_id + "' id='" +
    Config.chart_link_id + "'>&gt;&nbsp;&gt;&nbsp;Comment filter</a>";
  chart_link_div.innerHTML += "<span id='mytestspan'>Click: </span>" +
    "<span id='mytestspantarget'>0</span>";

  entrytext_div.parentNode.insertBefore(chart_link_div, entrytext_div);

  addCustomStyles();
  processPosts();
  modifyPosts();
  drawChart();
  initializeEventListeners();
  addEventListeners();

  simulateClickShow(0);
  Logger.info("Ending init() for BikePortlandFilterByRecommended script.");
};

init();
