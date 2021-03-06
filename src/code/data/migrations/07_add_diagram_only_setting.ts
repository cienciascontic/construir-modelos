/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

const _ = require("lodash");

import { MigrationMixin } from "./migration-mixin";

const migration = {
  version: "1.6.0",
  description: "Adds diagramOnly setting. Default == false",
  date: "2015-09-22",

  doUpdate(data) {
    if (data.settings == null) { data.settings = {}; }
    return data.settings.diagramOnly != null ? data.settings.diagramOnly : (data.settings.diagramOnly = false);
  }
};

export const migration_07 = _.mixin(migration, MigrationMixin);
