// ==UserScript==
// @name           BikePortlandFilterByRecommended
// @namespace      http://namespace.kinobe.com/greasemonkey/
// @description    Greasemonkey script that allows the user to select which bikeportland.org comments they wish to view based on how many times it has been recommended.
// @include        /^https?://bikeportland\.org/.*$/
// @include        /^https?://bp/Sites/bikeportland/index.html$/
// @version        1.6
// @grant          GM_addStyle
// ==/UserScript==

/*

 This copyright section and all credits in the script must be included in modifications or redistributions of this script.

 BikePortlandFilterByRecommended is Copyright (c) 2011, Jonathan Gordon
 BikePortlandFilterByRecommended is licensed under a Creative Commons Attribution-Share Alike 3.0 Unported License
 License information is available here: http://creativecommons.org/licenses/by-sa/3.0/

 BikePortland is owned by PedalTown Media Inc.
 BikePortlandFilterByRecommended is not related to or endorsed by PedalTown Media Inc. in any way.

 */

/*
 This script borrows heavily from Jimmy Woods' Metafilter favorite posts filter script
 http://userscripts.org/scripts/show/75332

 Also from Jordan Reiter's Metafilter MultiFavorited Multiwidth - November Experiment
 http://userscripts.org/scripts/show/61012

 Version 1.4/1.5
 - Updated to work with https

 Version 1.3
 - Enhancements

 Version 1.1
 - Added additional recommended styling on left, ala the Metafilter MultiFavorited Multiwidth script.

 Version 1.0
 - Initial Release.

 */

/*jslint
 browser
 */


var foreach = function (fn) {
  var arrayLike = this;
  var len = arrayLike.length;
  for (var i = 0; i < len; ++i) {
    fn(arrayLike[i], i);
  }
};

Object.defineProperty(Array.prototype, "customForEach", {
  enumerable: false,
  value: foreach
});

Object.defineProperty(HTMLCollection.prototype, "customForEach", {
  enumerable: false,
  value: foreach
});

Object.defineProperty(Map.prototype, "getOrElse", {
  enumerable: false,
  value: function (key, value) {
    return this.has(key) ? this.get(key) : value;
  }
});


var LogLevelEnum = {
  DEBUG: {value: 0, name: "Debug"},
  INFO: {value: 1, name: "Info"},
  WARN: {value: 2, name: "Warn"},
  ERROR: {value: 3, name: "Error"}
};

var Global = {
  selected_row: null,        // Reference to the last TR tag in the select table that a user clicked on.
  chart_bg_color: "#CCC",   // Background color for the table rows.
  chart_selected_color: "#F2A175",     // BG color for the selected table row.
  selected_color: "#88c2d8",     // BG color for the selected table row.
  hover_color: "#F2A175",     // BG color for the selected table row.
  favorite_color: "#ff7617",     // BG color for the selected table row.
  post_count_color: "white",
  fav_count_color: "#BBD",
  posts: [],        // Stores info about each post
  numRecsCountMap: new Map([[0, 0]]),
  max_favorites: 0,   // Highest favourite count so far.
  logLevel: LogLevelEnum.INFO,   // What level should we log at?
  row_prefix: "summary_id_", // Used to set the ID for each row in the comment/favorite chart
  chart_id: "chart_id", // Used to set the ID for each row in the comment/favorite chart
  chart_link_id: "chart_link_id", // Used to set the ID for each row in the comment/favorite chart
  recommended_regex: new RegExp("^(\\d+)_(\\d+)$"),
  doLog: true   // Should we log messages?
};

Global.row_regex = new RegExp("^" + Global.row_prefix + "(\\d+)$");

/**
 * ----------------------------------
 * Logger
 * ----------------------------------
 * Allows swapping out GM logger for console
 */
Logger = {

  log: function (message, logLevelEnum) {
    logLevelEnum = logLevelEnum || LogLevelEnum.INFO;

    if (Global.doLog && logLevelEnum.value >= Global.logLevel.value) {
//            GM_log(message);
      console.log(logLevelEnum.name + ": " + message);
    }
  }, debug: function (message) {
    Logger.log(message, LogLevelEnum.DEBUG);
  }, info: function (message) {
    Logger.log(message, LogLevelEnum.INFO);
  }, warn: function (message) {
    Logger.log(message, LogLevelEnum.WARN);
  }, error: function (message) {
    Logger.log(message, LogLevelEnum.ERROR);
  }
};

/**
 * ----------------------------------
 * Util
 * ----------------------------------
 * Various utility functions
 */
Util = {
  /**
   * Returns an array of DOM elements that match a given XPath expression.
   *
   * @param path string - Xpath expression to search for
   * @param from DOM Element - DOM element to search under. If not specified, document is used
   * @return Array - Array of selected nodes (if any)
   */
  getNodesFromTagWithClass: function (tag, className, from) {

    var path = "//" + tag + "[contains(concat(' ', normalize-space(@class), ' '), ' " + className + " ')]";
    return Util.getNodes(path, from);
  },

  /**
   * Returns an array of DOM elements that match a given XPath expression.
   *
   * @param path string - Xpath expression to search for
   * @param from DOM Element - DOM element to search under. If not specified, document is used
   * @return Array - Array of selected nodes (if any)
   */
  getNodes: function (path, from) {
    from = from || document;

    var node;
    var nodes = [];
    var iterator = document.evaluate(path, from, null, XPathResult.ANY_TYPE, null);
    while ((node = iterator.iterateNext()) !== null) {
      nodes.push(node);
    }
    Logger.debug("Num elements found by getNodes: " + nodes.length);
    return nodes;
  },

  /**
   * Deletes a DOM element
   * @param element - DOM element to remove
   * @return DOM element - the removed element
   */
  removeElement: function (element) {
    return element.parentNode.removeChild(element);
  },

  /**
   * Binds an event handler function to an object context, so that the handler can be executed as if it
   * was called using "this.<method name>(event)", i.e. it can use "this.foo" inside it.
   *
   * @param method - a function to execute as an event handler
   * @param context - the object that will be used as context for the function, as if the function had been
   *          called as context.method(event);
   * @return function - the function to pass to addEventListener
   */
  bindAsEventHandler: function (method, context) {
    var __method = method;
    return function (event) {
      return __method.apply(context, [event]);
    };
  },

  //Finds y value of given object
  findPos: function (obj) {
    var current_top = 0;
    if (obj.offsetParent) {
      do {
        current_top += obj.offsetTop;
      } while ((obj = obj.offsetParent) !== null);
    }
    return current_top;
  },

  simulateClickShow: function (count) {
    var elementById = document.getElementById(Global.row_prefix + count);
    elementById.click();
    highlightClick(count);
  },

  elementHasClass: function (element, classname) {
    return element !== null && element.classList.contains(classname);
  },

  getElementsByClassName: function (node, classname) {
    if (node.getElementsByClassName) { // use native implementation if available
      Logger.debug("Using native implementation...");
      return node.getElementsByClassName(classname);
    } else {
      return (function getElementsByClass(searchClass, node) {
        if (node === null)
          node = document;
        var classElements = [], els = node.getElementsByTagName("*"), elsLen = els.length, pattern = new RegExp("(^|\\s)" + searchClass + "(\\s|$)"), i, j;
        Logger.debug("Total elements: " + els.length);
        Logger.debug("Looking for" + searchClass);

        for (i = 0, j = 0; i < elsLen; i++) {

          var elsClassName = els[i].className;
          if ("" !== elsClassName) {
            Logger.debug("Class of element: " + elsClassName);
          }
          if (pattern.test(elsClassName)) {
            classElements[j] = els[i];
            j++;
          }
        }
        return classElements;
      })(classname, node);
    }
  }


};

/*
 * Event handler for when user clicks on a row
 */
function filterPosts(evt) {

  Logger.debug("Start filterPosts");

  // Get the clicked element
  var row_div = evt.target;

  while (!Util.elementHasClass(row_div, "chart_row")) {
    Logger.debug("Getting parent of div: " + row_div.innerHTML);
    row_div = row_div.parentNode;
  }

  // Determine its ID and extract the number from it.
  var filter_count = Global.row_regex.exec(row_div.id)[1];
  Logger.debug("filter_count is: " + filter_count);

  // Hide/unhide all posts that don"t match the chosen fav count.
  var i = Global.posts.length;
  while (i--) {
    var is_showing = (Global.posts[i].div.style.display !== "none");
    var show = (Global.posts[i].recommended_count >= filter_count);
    if (show != is_showing) {
      Global.posts[i].div.style.display = (show ? "" : "none");
    }
  }

  // Reset the color of the previous row to be clicked on.
  if (Global.selected_row !== null) {
    Global.selected_row.style.background = Global.chart_bg_color;
  }
  // Set the color of the row we just clicked on
  row_div.style.background = Global.chart_selected_color;
  Global.selected_row = row_div;

  highlightClick(filter_count);

  Logger.debug("End filterPosts");

}

// ---------------------------


// a function that loads jQuery and calls a callback function when jQuery has finished loading
function addJQuery(callback) {
  var script = document.createElement("script");
  script.setAttribute("src", "http://ajax.googleapis.com/ajax/libs/jquery/1.6.4/jquery.min.js");
  script.addEventListener("load", function () {
    var script = document.createElement("script");
    script.textContent = "(" + callback.toString() + ")();";
    document.body.appendChild(script);
  }, false);
  document.body.appendChild(script);
}

function highlightClick(count) {

  var rows = Util.getNodes("//span[contains(concat(' ', normalize-space(@class), ' '), ' click_count ')]");
  //var rows = Util.getNodesFromTagWithClass("span", "click_count");

  rows.forEach(function (val) {

    var cur_count = Global.recommended_regex.exec(val.id)[2];

    var font_weight = count == cur_count ? "normal" : "lighter";
    var color = count == cur_count ? Global.selected_color : Global.hover_color;

    val.style.setProperty("color", color, "important");
    val.style.setProperty("font-weight", font_weight, "important");
  });

}

function captureShowClick(e) {

  var click_target = e.target;
  while (click_target.tagName != "SPAN") {
    click_target = click_target.parentNode;
  }

  var count = Global.recommended_regex.exec(click_target.id)[2];

  Logger.debug("Count is: " + count);
  Logger.debug("click_target is: " + click_target);
  var prevPos = Util.findPos(click_target);
  Logger.debug("click_target pos before: " + prevPos);

  var diff = prevPos - window.pageYOffset;

  Util.simulateClickShow(count);


  var newPos = Util.findPos(click_target);
  Logger.debug("click_target pos after: " + newPos);

  window.scroll(0, newPos - diff);
  return false;
}

function addCustomStyles() {

  // make sure we have the fonts we need
  var link = document.createElement("link");
  link.type = "text/css";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css?family=Open+Sans:light";
  document.head.appendChild(link);

  GM_addStyle("#comments { margin-bottom: 1em; }" +
    " .td1 {cursor: pointer; border: 1px solid white; background: " + Global.chart_bg_color + "; }" +
    " .myhr {height: 7px ; margin-top: 2px; margin-bottom: 2px; }" +
    " .hr1 {color:" + Global.post_count_color + "; background-color: " + Global.post_count_color + "; }" +
    " .hr2 {color:" + Global.fav_count_color + "; background-color: " + Global.fav_count_color + "; }"
  );

  GM_addStyle("#" + Global.chart_id + ",.chart_link, .chart_title, .chart, .heading, .chart_right,.chart_row, .comments, .favs, .all_favs, .click_count {" +
    "font-weight: lighter !important;" +
    "font-family: 'Open Sans' !important;" +
    "}");

  GM_addStyle(".chart_link {" +
    "font: 16px !important;" +
    "color: " + Global.favorite_color + " !important;" +
    "}");

  GM_addStyle("#" + Global.chart_id + " {" +
    "white-space: nowrap !important;" +
    "padding: 3px 0 !important;" +
    "}");


  GM_addStyle(".chart_title {" +
    "padding: 3px 0 !important;" +
    "margin: 0px 4px !important;" +
    "font-size: 200% !important;" +
    "color: " + Global.favorite_color + " !important;" +
    "}");

  GM_addStyle(".chart {" +
    "background-color: " + Global.chart_bg_color + " !important;" +
    "width: 90% !important;" +
    "font: 14px !important;" +
    "margin: 0px 4px !important;" +
    "color: black !important;" +
    "border:1px solid white !important;" +
    "border-collapse:collapse !important;" +
    "}");


  GM_addStyle(".comments {" +
    "margin-left: 1em !important;" +
    "float: left !important;" +
    "width: 10% !important;" +
    "}");

  GM_addStyle(".favs, .chart_right, .all_favs {" +
    "float: left !important;" +
    "margin-right: 4px !important;" +
    "padding-left: 4px !important;" +
    "text-align: left !important;" +
    "}");

  GM_addStyle(".favs {" +
    "background-color: " + Global.favorite_color + " !important;" +
    "color: white !important;" +
    "}");

  GM_addStyle(".chart_right {" +
    "font-size: 160% !important;" +
    "}");

  GM_addStyle(".chart_row, .heading {" +
    "display: block !important;" +
    "padding: 3px 0px !important;" +
    "margin-bottom: 6px !important;" +
    "}");

  GM_addStyle(".chart_row:hover {" +
    "background-color: " + Global.hover_color + " !important;" +
    "}");

  GM_addStyle(".comment_highlight {" +
    "border-top: 0px !important;" +
    "border-bottom: 0px !important;" +
    "padding-left: 5px !important;" +
    "}");

  GM_addStyle(".clearfix:after {" +
    "content: '.' !important;" +
    "display: block !important;" +
    "height: 0 !important;" +
    "clear: both !important;" +
    "visibility: hidden !important;" +
    "}");
}

function processComments() {

  Global.posts.length = 0;

  // Create a link to the chart
  var entrytext_div = Util.getNodesFromTagWithClass("div", "entrytext")[0];
  var chart_link_div = document.createElement("div");
  chart_link_div.className = "chart_link";
  chart_link_div.innerHTML = "<a href='#" + Global.chart_id + "' id='" + Global.chart_link_id + "'>&gt;&nbsp;&gt;&nbsp;Comment filter</a>";
  entrytext_div.parentNode.insertBefore(chart_link_div, entrytext_div);


  // Get posts and compile them into array
  var recommended_re = /^(\d+)$/;
  var id_re = /^div\-comment\-(\d+)$/;
  var comment_divs = Util.getNodesFromTagWithClass("div", "comment-body");

  comment_divs.forEach(function (comment_div) {

    var comment_div_id = comment_div.id;

    // we ignore the reply comment div, which doesn't have an id
    if (comment_div_id === undefined || !id_re.test(comment_div_id)) {
      Logger.debug("Invalid ID found for comment: " + comment_div_id);
      return;
    }

    var id_num = id_re.exec(comment_div_id)[1];
    var recommended_span = Util.getNodes(".//span[@id='karma-" + id_num + "-up']", comment_div)[0];
    var recommended_text = recommended_span.textContent;
    var recommended_count = recommended_re.test(recommended_text) ? parseInt(recommended_re.exec(recommended_text)[1]) : 0;

    Global.numRecsCountMap.set(recommended_count, Global.numRecsCountMap.getOrElse(recommended_count, 0) + 1);

    Global.max_favorites = Math.max(recommended_count, Global.max_favorites);
    Global.posts.push({
      "div": comment_div,
      "recommended_count": recommended_count,
      "id_num": id_num
    });

  });
}
function modifyComments() {
  Global.posts.customForEach(function (post, j) {

    // we only highlight 3 and above
    if (post.recommended_count > 2) {
      var recommendedWidthSize = (Math.round(post.recommended_count / 2) + 1);
      post.div.style.setProperty("border-left", recommendedWidthSize + "px solid " + Global.favorite_color, "important");

      // add the highlight class if it does not already exist
      if ((" " + post.div.class + " ").indexOf(" comment_highlight ") == -1) {
        post.div.class += " comment_highlight";
      }
    }

    var recommended_span = Util.getNodes(".//span[@id='karma-" + post.id_num + "-up']", post.div)[0];
    var show_span = document.createElement("span");
    show_span.innerHTML = "&nbsp;Show:&nbsp;";

    var show_all_span = document.createElement("span");
    show_all_span.className = "click_count";
    show_all_span.id = post.id_num + "_0";
    show_all_span.innerHTML = "&nbsp;<a>All</a>";

    recommended_span.parentNode.insertBefore(show_all_span, recommended_span.nextSibling);

    if (post.recommended_count > 0) {
      var show_count_span = document.createElement("span");
      show_count_span.className = "click_count";
      show_count_span.id = post.id_num + "_" + post.recommended_count;

      var top_count = Array.from(Global.numRecsCountMap.entries()).filter(function (entry) {
        return entry[0] >= post.recommended_count;
      }).reduce(function (total, entry) {
        return total + entry[1];
      }, 0);

      show_count_span.innerHTML = "&nbsp;<a>Top " + top_count + " recommendations</a>&nbsp;|";

      recommended_span.parentNode.insertBefore(show_count_span, recommended_span.nextSibling);
    }

    recommended_span.parentNode.insertBefore(show_span, recommended_span.nextSibling);
  });
}

function addEventListeners() {
// Add the event listeners.
  document.addEventListener("keydown", function (e) {

    // pressed alt+g
    if (e.keyCode == 71 && !e.shiftKey && !e.ctrlKey && e.altKey && !e.metaKey) {
      Util.simulateClickShow(0);
    }

    // pressed alt+c
    if (e.keyCode == 67 && !e.shiftKey && !e.ctrlKey && e.altKey && !e.metaKey) {
      document.getElementById(Global.chart_link_id).click();
    }
  }, false);

  Util.getElementsByClassName(document, "click_count").customForEach(function (val, i) {
    val.addEventListener("click", captureShowClick, false);
  });

  Util.getNodesFromTagWithClass("div", "chart_row").customForEach(function (val, i) {
    val.addEventListener("click", filterPosts, false);
  });
}

/**
 * Generates the chart at the top of the page
 * @return void
 */
function initChart() {
  Logger.debug("Creating chart for total counts: " + Global.numRecsCountMap);

  var chart_div = document.createElement("div");
  var data_rows_html = "<div class='chart'>";
  var commentSum = 0;
  var keys = Array.from(Global.numRecsCountMap.keys());

  // we want a descending sort
  keys.sort(function (a, b) {
    return b - a;
  });

  data_rows_html += "<div class='heading clearfix'>" +
    "<div class='comments'>&nbsp;</div>" +
    "<div class='chart_right' style='width: 80%;'>Minimum # of recommendations</div>" +
    "</div>";

  keys.customForEach(function (key, i) {
    commentSum += Global.numRecsCountMap.get(key);

    var recommendedWidthSize = (Math.round((key / Global.max_favorites) * 80));

    var comment_count_label = key === 0 ? "All " : "Top ";
    var num_recs_style = key === 0 ? "all_favs" : "favs";
    data_rows_html += "<div id='" + Global.row_prefix + key + "' class='chart_row clearfix'>" +
      "<div class='comments'>" + comment_count_label + commentSum + "</div>" +
      "<div class='" + num_recs_style + "' style='width: " + recommendedWidthSize + "%;'>" + key + "</div>" +
      "</div>";

  });

  // Insert table into page
  chart_div.innerHTML = "<div id='" + Global.chart_id + "' class='clearfix'>" +
    "<span class='chart_title'>Most Popular Comments</span>" +
    "</div>" +
    data_rows_html;

  var page_div = document.getElementById("comments");
  page_div.insertBefore(chart_div, page_div.firstChild);

}

function init() {

  Logger.info("Starting init() for BikePortlandFilterByRecommended script...");

  // if we can't find comments, it's probably because this is being called for a page we haven't excluded
  if (undefined === document.getElementById("comments")) {
    Logger.info("No comments founds. Exiting.");
    return;
  }

  addCustomStyles();
  processComments();
  modifyComments();
  initChart();
  addEventListeners();

  Util.simulateClickShow(0);
  Logger.info("Ending init() for BikePortlandFilterByRecommended script.");
}

init();
