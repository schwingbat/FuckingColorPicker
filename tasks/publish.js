/**
 * Uploads zipped builds to Amazon S3.
 */

const fs = require("fs");
const path = require("path");
const package = require("../package.json");
