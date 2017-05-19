# BikePortland Filter By Recommended by Jonathan Gordon

## Description

Allows a user to select BikePortland comments they wish to view based on how many times it has been recommended.

## Version 1.0

This userscript is hosted at https://greasyfork.org/en/scripts/19975-bikeportlandfilterbyrecommended

It is synced with this github location: https://github.com/jonathanpdx/BikePortlandFilterByRecommended

## Usage

To use this script, install via Greasemonkey/Tampermonkey. If you have either *monkey installed, downloading the script via your
browser should prompt for install.

## Suggestions

If you have any suggestions as to how you'd like this script to behave differently, please don't hesitate to ask!

### Features

#### Comments/Recommendations chart

At the top of the comments section, a chart should appear showing the Most Popular Comments. Clicking on any bar on the chart will filter the display of comments that
have at least that many recommendations.

![Comments/Recommendations Graph](https://raw.githubusercontent.com/jonathanpdx/BikePortlandFilterByRecommended/master/comment-chart.png "Current selection remains highlighted.")

#### Show weighted recommendation bar next to each comment.

Each comment has a bar next to it, with the width growing in proportion to the number of times it has been recommended.

![Comments with recommendation bar](https://raw.githubusercontent.com/jonathanpdx/BikePortlandFilterByRecommended/master/comments-with-bars.jpg "The more comments the wider the bar.")

#### Show: Top X recommendations | All

Two additional links will appear next to each comment's recommendation count allowing you to filter comments in-place.

![Adjust recommendation level per comment](https://raw.githubusercontent.com/jonathanpdx/BikePortlandFilterByRecommended/master/comment.jpg "Show: Top X recommendations | All")

#### Hotkey(s)

[ALT + g] -> "Show all"
[ALT + c] -> "Scroll to chart"

## Special Thanks

Special thanks to Jordan Reiter and Jimmy Woods for their previous work on MetaFilter favorite user scripts, on which this work is heavily based.
