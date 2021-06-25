/* eslint-disable prefer-rest-params */
import Slick from "./slick.core";
import $ from "jquery";
import GroupItemMetaDataProvider from "./slick.groupmetadataprovider";
import GroupItemMetadataProvider from "./slick.groupmetadataprovider";

type AnyDict = { [key: string]: any };

type FilterFunction = (a: any, args: any) => boolean;

/** *
 * A sample Model implementation.
 * Provides a filtered view of the underlying data.
 *
 * Relies on the data item having an "id" property uniquely identifying it.
 */
class DataView {
  private options;
  private self: DataView;
  private defaults = {
    groupItemMetadataProvider: null,
    inlineFilters: false,
  };

  constructor(options) {
    this.self = this;
    options = $.extend(true, {}, this.defaults, options);
  }

  // private
  private idProperty = "id"; // property holding a unique row id
  private items = [] as any[]; // data by index
  private rows = [] as any[]; // data by row
  private idxById = {} as AnyDict; // indexes by id
  private rowsById = null as AnyDict | null; // rows by id; lazy-calculated
  private filter = null as FilterFunction | null; // filter function
  private updated = null as AnyDict | null; // updated item ids
  private suspend = false; // suspends the recalculation
  private sortAsc = true;
  private fastSortField;
  private sortComparer;
  private refreshHints = {} as AnyDict;
  private prevRefreshHints = {} as AnyDict;
  private filterArgs;
  private filteredItems = [] as any[];
  private compiledFilter;
  private compiledFilterWithCaching;
  private filterCache = [] as any[];

  // grouping
  private groupingInfoDefaults = {
    getter: null,
    formatter: null,
    comparer: function (a, b) {
      return a.value === b.value ? 0 : a.value > b.value ? 1 : -1;
    },
    predefinedValues: [],
    aggregators: [],
    aggregateEmpty: false,
    aggregateCollapsed: false,
    aggregateChildGroups: false,
    collapsed: false,
    displayTotalsRow: true,
    lazyTotalsCalculation: false,
  };
  private groupingInfos = [] as any[];
  private groups = [] as any[];
  private toggledGroupsByLevel = [] as any[];
  private groupingDelimiter = ":|:";

  private pagesize = 0;
  private pagenum = 0;
  private totalRows = 0;

  // events
  private onRowCountChanged = new Slick.Event();
  private onRowsChanged = new Slick.Event();
  private onPagingInfoChanged = new Slick.Event();

  beginUpdate() {
    this.suspend = true;
  }

  endUpdate() {
    this.suspend = false;
    this.refresh();
  }

  setRefreshHints(hints) {
    this.refreshHints = hints;
  }

  setFilterArgs(args) {
    this.filterArgs = args;
  }

  updateIdxById(startingIndex?) {
    startingIndex = startingIndex || 0;
    let id;
    for (let i = startingIndex, l = this.items.length; i < l; i++) {
      id = this.items[i][this.idProperty];
      if (id === undefined) {
        throw "Each data element must implement a unique 'id' property";
      }
      this.idxById[id] = i;
    }
  }

  ensureIdUniqueness() {
    let id;
    for (let i = 0, l = this.items.length; i < l; i++) {
      id = this.items[i][this.idProperty];
      if (id === undefined || this.idxById[id] !== i) {
        throw "Each data element must implement a unique 'id' property";
      }
    }
  }

  getItems() {
    return this.items;
  }

  setItems(data, objectIdProperty) {
    if (objectIdProperty !== undefined) {
      this.idProperty = objectIdProperty;
    }
    this.items = this.filteredItems = data;
    this.idxById = {} as AnyDict;
    this.updateIdxById();
    this.ensureIdUniqueness();
    this.refresh();
  }

  setPagingOptions(args) {
    if (args.pageSize != undefined) {
      this.pagesize = args.pageSize;
      this.pagenum = this.pagesize
        ? Math.min(
            this.pagenum,
            Math.max(0, Math.ceil(this.totalRows / this.pagesize) - 1)
          )
        : 0;
    }

    if (args.pageNum != undefined) {
      this.pagenum = Math.min(
        args.pageNum,
        Math.max(0, Math.ceil(this.totalRows / this.pagesize) - 1)
      );
    }

    this.onPagingInfoChanged.notify(this.getPagingInfo(), null, self);

    this.refresh();
  }

  getPagingInfo() {
    const totalPages = this.pagesize
      ? Math.max(1, Math.ceil(this.totalRows / this.pagesize))
      : 1;
    return {
      pageSize: this.pagesize,
      pageNum: this.pagenum,
      totalRows: this.totalRows,
      totalPages: totalPages,
      dataView: self,
    };
  }

  sort(comparer, ascending) {
    this.sortAsc = ascending;
    this.sortComparer = comparer;
    this.fastSortField = null;
    if (ascending === false) {
      this.items.reverse();
    }
    this.items.sort(comparer);
    if (ascending === false) {
      this.items.reverse();
    }
    this.idxById = {} as AnyDict;
    this.updateIdxById();
    this.refresh();
  }

  /** *
   * Provides a workaround for the extremely slow sorting in IE.
   * Does a [lexicographic] sort on a give column by temporarily overriding Object.prototype.toString
   * to return the value of that field and then doing a native Array.sort().
   */
  fastSort(field, ascending) {
    this.sortAsc = ascending;
    this.fastSortField = field;
    this.sortComparer = null;
    const oldToString = Object.prototype.toString;
    Object.prototype.toString =
      typeof field == "function"
        ? field
        : function (this: string) {
            return this[field];
          };
    // an extra reversal for descending sort keeps the sort stable
    // (assuming a stable native sort implementation, which isn't true in some cases)
    if (ascending === false) {
      this.items.reverse();
    }
    this.items.sort();
    Object.prototype.toString = oldToString;
    if (ascending === false) {
      this.items.reverse();
    }
    this.idxById = {} as AnyDict;
    this.updateIdxById();
    this.refresh();
  }

  reSort() {
    if (this.sortComparer) {
      this.sort(this.sortComparer, this.sortAsc);
    } else if (this.fastSortField) {
      this.fastSort(this.fastSortField, this.sortAsc);
    }
  }

  setFilter(filterFn) {
    this.filter = filterFn;
    if (this.options.inlineFilters) {
      this.compiledFilter = this.compileFilter();
      this.compiledFilterWithCaching = this.compileFilterWithCaching();
    }
    this.refresh();
  }

  getGrouping() {
    return this.groupingInfos;
  }

  setGrouping(groupingInfo) {
    if (!this.options.groupItemMetadataProvider) {
      this.options.groupItemMetadataProvider = new GroupItemMetadataProvider();
    }

    this.groups = [] as any[];
    this.toggledGroupsByLevel = [] as any[];
    groupingInfo = groupingInfo || [];
    this.groupingInfos =
      groupingInfo instanceof Array ? groupingInfo : [groupingInfo];

    for (let i = 0; i < this.groupingInfos.length; i++) {
      const gi = (this.groupingInfos[i] = $.extend(
        true,
        {},
        this.groupingInfoDefaults,
        this.groupingInfos[i]
      ));
      gi.getterIsAFn = typeof gi.getter === "function";

      // pre-compile accumulator loops
      gi.compiledAccumulators = [] as any[];
      let idx = gi.aggregators.length;
      while (idx--) {
        gi.compiledAccumulators[idx] = this.compileAccumulatorLoop(
          gi.aggregators[idx]
        );
      }

      this.toggledGroupsByLevel[i] = {} as AnyDict;
    }

    this.refresh();
  }

  /**
   * @deprecated Please use {@link setGrouping}.
   */
  groupBy(valueGetter, valueFormatter, sortComparer) {
    if (valueGetter == null) {
      this.setGrouping([]);
      return;
    }

    this.setGrouping({
      getter: valueGetter,
      formatter: valueFormatter,
      comparer: sortComparer,
    });
  }

  /**
   * @deprecated Please use {@link setGrouping}.
   */
  setAggregators(groupAggregators, includeCollapsed) {
    if (!this.groupingInfos.length) {
      throw new Error(
        "At least one grouping must be specified before calling setAggregators()."
      );
    }

    this.groupingInfos[0].aggregators = groupAggregators;
    this.groupingInfos[0].aggregateCollapsed = includeCollapsed;

    this.setGrouping(this.groupingInfos);
  }

  getItemByIdx(i) {
    return this.items[i];
  }

  getIdxById(id) {
    return this.idxById[id];
  }

  ensureRowsByIdCache() {
    if (!this.rowsById) {
      this.rowsById = {} as AnyDict;
      for (let i = 0, l = this.rows.length; i < l; i++) {
        this.rowsById[this.rows[i][this.idProperty]] = i;
      }
    }
  }

  getRowById(id) {
    this.ensureRowsByIdCache();
    return this.rowsById![id];
  }

  getItemById(id) {
    return this.items[this.idxById[id]];
  }

  mapIdsToRows(idArray) {
    const rows = [] as any[];
    this.ensureRowsByIdCache();
    for (let i = 0, l = idArray.length; i < l; i++) {
      const row = this.rowsById![idArray[i]];
      if (row != null) {
        rows[rows.length] = row;
      }
    }
    return rows;
  }

  mapRowsToIds(rowArray) {
    const ids = [] as any[];
    for (let i = 0, l = rowArray.length; i < l; i++) {
      if (rowArray[i] < this.rows.length) {
        ids[ids.length] = this.rows[rowArray[i]][this.idProperty];
      }
    }
    return ids;
  }

  updateItem(id, item) {
    if (this.idxById[id] === undefined || id !== item[this.idProperty]) {
      throw "Invalid or non-matching id";
    }
    this.items[this.idxById[id]] = item;
    if (!this.updated) {
      this.updated = {};
    }
    this.updated[id] = true;
    this.refresh();
  }

  insertItem(insertBefore, item) {
    this.items.splice(insertBefore, 0, item);
    this.updateIdxById(insertBefore);
    this.refresh();
  }

  addItem(item) {
    this.items.push(item);
    this.updateIdxById(this.items.length - 1);
    this.refresh();
  }

  deleteItem(id) {
    const idx = this.idxById[id];
    if (idx === undefined) {
      throw "Invalid id";
    }
    delete this.idxById[id];
    this.items.splice(idx, 1);
    this.updateIdxById(idx);
    this.refresh();
  }

  getLength() {
    return this.rows.length;
  }

  getItem(i) {
    const item = this.rows[i];

    // if this is a group row, make sure totals are calculated and update the title
    if (item && item.__group && item.totals && !item.totals.initialized) {
      const gi = this.groupingInfos[item.level];
      if (!gi.displayTotalsRow) {
        this.calculateTotals(item.totals);
        item.title = gi.formatter ? gi.formatter(item) : item.value;
      }
    }
    // if this is a totals row, make sure it's calculated
    else if (item && item.__groupTotals && !item.initialized) {
      this.calculateTotals(item);
    }

    return item;
  }

  getItemMetadata(i) {
    const item = this.rows[i];
    if (item === undefined) {
      return null;
    }

    // overrides for grouping rows
    if (item.__group) {
      return this.options.groupItemMetadataProvider.getGroupRowMetadata(item);
    }

    // overrides for totals rows
    if (item.__groupTotals) {
      return this.options.groupItemMetadataProvider.getTotalsRowMetadata(item);
    }

    return null;
  }

  expandCollapseAllGroups(level, collapse) {
    if (level == null) {
      for (let i = 0; i < this.groupingInfos.length; i++) {
        this.toggledGroupsByLevel[i] = {} as AnyDict;
        this.groupingInfos[i].collapsed = collapse;
      }
    } else {
      this.toggledGroupsByLevel[level] = {} as AnyDict;
      this.groupingInfos[level].collapsed = collapse;
    }
    this.refresh();
  }

  /**
   * @param level {Number} Optional level to collapse.  If not specified, applies to all levels.
   */
  collapseAllGroups(level) {
    this.expandCollapseAllGroups(level, true);
  }

  /**
   * @param level {Number} Optional level to expand.  If not specified, applies to all levels.
   */
  expandAllGroups(level) {
    this.expandCollapseAllGroups(level, false);
  }

  expandCollapseGroup(level, groupingKey, collapse) {
    this.toggledGroupsByLevel[level][groupingKey] =
      this.groupingInfos[level].collapsed ^ collapse;
    this.refresh();
  }

  /**
   * @param letArgs Either a Slick.Group's "groupingKey" property, or a
   *     letiable argument list of grouping values denoting a unique path to the row.  For
   *     example, calling collapseGroup('high', '10%') will collapse the '10%' subgroup of
   *     the 'high' group.
   */
  collapseGroup(letArgs) {
    const args = Array.prototype.slice.call(arguments);
    const arg0 = args[0];
    if (args.length == 1 && arg0.indexOf(this.groupingDelimiter) != -1) {
      this.expandCollapseGroup(
        arg0.split(this.groupingDelimiter).length - 1,
        arg0,
        true
      );
    } else {
      this.expandCollapseGroup(
        args.length - 1,
        args.join(this.groupingDelimiter),
        true
      );
    }
  }

  /**
   * @param letArgs Either a Slick.Group's "groupingKey" property, or a
   *     letiable argument list of grouping values denoting a unique path to the row.  For
   *     example, calling expandGroup('high', '10%') will expand the '10%' subgroup of
   *     the 'high' group.
   */
  expandGroup(letArgs) {
    const args = Array.prototype.slice.call(arguments);
    const arg0 = args[0];
    if (args.length == 1 && arg0.indexOf(this.groupingDelimiter) != -1) {
      this.expandCollapseGroup(
        arg0.split(this.groupingDelimiter).length - 1,
        arg0,
        false
      );
    } else {
      this.expandCollapseGroup(
        args.length - 1,
        args.join(this.groupingDelimiter),
        false
      );
    }
  }

  getGroups() {
    return this.groups;
  }

  extractGroups(rows, parentGroup?) {
    let group;
    let val;
    const groups = [] as any[];
    const groupsByVal = {} as AnyDict;
    let r;
    const level = parentGroup ? parentGroup.level + 1 : 0;
    const gi = this.groupingInfos[level];

    for (let i = 0, l = gi.predefinedValues.length; i < l; i++) {
      val = gi.predefinedValues[i];
      group = groupsByVal[val];
      if (!group) {
        group = new Slick.Group();
        group.value = val;
        group.level = level;
        group.groupingKey =
          (parentGroup
            ? parentGroup.groupingKey + this.groupingDelimiter
            : "") + val;
        groups[groups.length] = group;
        groupsByVal[val] = group;
      }
    }

    for (let i = 0, l = rows.length; i < l; i++) {
      r = rows[i];
      val = gi.getterIsAFn ? gi.getter(r) : r[gi.getter];
      group = groupsByVal[val];
      if (!group) {
        group = new Slick.Group();
        group.value = val;
        group.level = level;
        group.groupingKey =
          (parentGroup
            ? parentGroup.groupingKey + this.groupingDelimiter
            : "") + val;
        groups[groups.length] = group;
        groupsByVal[val] = group;
      }

      group.rows[group.count++] = r;
    }

    if (level < this.groupingInfos.length - 1) {
      for (let i = 0; i < groups.length; i++) {
        group = groups[i];
        group.groups = this.extractGroups(group.rows, group);
      }
    }

    groups.sort(this.groupingInfos[level].comparer);

    return groups;
  }

  calculateTotals(totals) {
    const group = totals.group;
    const gi = this.groupingInfos[group.level];
    const isLeafLevel = group.level == this.groupingInfos.length;
    let agg,
      idx = gi.aggregators.length;

    if (!isLeafLevel && gi.aggregateChildGroups) {
      // make sure all the subgroups are calculated
      let i = group.groups.length;
      while (i--) {
        if (!group.groups[i].totals.initialized) {
          this.calculateTotals(group.groups[i].totals);
        }
      }
    }

    while (idx--) {
      agg = gi.aggregators[idx];
      agg.init();
      if (!isLeafLevel && gi.aggregateChildGroups) {
        gi.compiledAccumulators[idx].call(agg, group.groups);
      } else {
        gi.compiledAccumulators[idx].call(agg, group.rows);
      }
      agg.storeResult(totals);
    }
    totals.initialized = true;
  }

  addGroupTotals(group) {
    const gi = this.groupingInfos[group.level];
    const totals = new Slick.GroupTotals();
    totals.group = group;
    group.totals = totals;
    if (!gi.lazyTotalsCalculation) {
      this.calculateTotals(totals);
    }
  }

  addTotals(groups, level?) {
    level = level || 0;
    const gi = this.groupingInfos[level];
    const groupCollapsed = gi.collapsed;
    const toggledGroups = this.toggledGroupsByLevel[level];
    let idx = groups.length,
      g;
    while (idx--) {
      g = groups[idx];

      if (g.collapsed && !gi.aggregateCollapsed) {
        continue;
      }

      // Do a depth-first aggregation so that parent group aggregators can access subgroup totals.
      if (g.groups) {
        this.addTotals(g.groups, level + 1);
      }

      if (
        gi.aggregators.length &&
        (gi.aggregateEmpty || g.rows.length || (g.groups && g.groups.length))
      ) {
        this.addGroupTotals(g);
      }

      g.collapsed = groupCollapsed ^ toggledGroups[g.groupingKey];
      g.title = gi.formatter ? gi.formatter(g) : g.value;
    }
  }

  flattenGroupedRows(groups, level?) {
    level = level || 0;
    const gi = this.groupingInfos[level];
    const groupedRows = [] as any[];
    let rows,
      gl = 0,
      g;
    for (let i = 0, l = groups.length; i < l; i++) {
      g = groups[i];
      groupedRows[gl++] = g;

      if (!g.collapsed) {
        rows = g.groups ? this.flattenGroupedRows(g.groups, level + 1) : g.rows;
        for (let j = 0, jj = rows.length; j < jj; j++) {
          groupedRows[gl++] = rows[j];
        }
      }

      if (
        g.totals &&
        gi.displayTotalsRow &&
        (!g.collapsed || gi.aggregateCollapsed)
      ) {
        groupedRows[gl++] = g.totals;
      }
    }
    return groupedRows;
  }

  getFunctionInfo(fn) {
    const fnRegex = /^function[^(]*\(([^)]*)\)\s*{([\s\S]*)}$/;
    const matches = fn.toString().match(fnRegex);
    return {
      params: matches[1].split(","),
      body: matches[2],
    };
  }

  compileAccumulatorLoop(aggregator) {
    const accumulatorInfo = this.getFunctionInfo(aggregator.accumulate);
    const fn = new Function(
      "_items",
      "for (let " +
        accumulatorInfo.params[0] +
        ", _i=0, _il=_items.length; _i<_il; _i++) {" +
        accumulatorInfo.params[0] +
        " = _items[_i]; " +
        accumulatorInfo.body +
        "}"
    ) as any;
    fn.displayName = "compiledAccumulatorLoop";
    return fn;
  }

  compileFilter() {
    const filterInfo = this.getFunctionInfo(this.filter);

    const filterPath1 = "{ continue _coreloop; }$1";
    const filterPath2 = "{ _retval[_idx++] = $item$; continue _coreloop; }$1";
    // make some allowances for minification - there's only so far we can go with RegEx
    const filterBody = filterInfo.body
      .replace(/return false\s*([;}]|\}|$)/gi, filterPath1)
      .replace(/return!1([;}]|\}|$)/gi, filterPath1)
      .replace(/return true\s*([;}]|\}|$)/gi, filterPath2)
      .replace(/return!0([;}]|\}|$)/gi, filterPath2)
      .replace(
        /return ([^;}]+?)\s*([;}]|$)/gi,
        "{ if ($1) { _retval[_idx++] = $item$; }; continue _coreloop; }$2"
      );

    // This preserves the function template code after JS compression,
    // so that replace() commands still work as expected.
    let tpl = [
      // "function(_items, _args) { ",
      "let _retval = [], _idx = 0; ",
      "let $item$, $args$ = _args; ",
      "_coreloop: ",
      "for (let _i = 0, _il = _items.length; _i < _il; _i++) { ",
      "$item$ = _items[_i]; ",
      "$filter$; ",
      "} ",
      "return _retval; ",
      // "}"
    ].join("");
    tpl = tpl.replace(/\$filter\$/gi, filterBody);
    tpl = tpl.replace(/\$item\$/gi, filterInfo.params[0]);
    tpl = tpl.replace(/\$args\$/gi, filterInfo.params[1]);

    const fn = new Function("_items,_args", tpl) as any;
    fn.displayName = "compiledFilter";

    return fn;
  }

  compileFilterWithCaching() {
    const filterInfo = this.getFunctionInfo(this.filter);

    const filterPath1 = "{ continue _coreloop; }$1";
    const filterPath2 =
      "{ _cache[_i] = true;_retval[_idx++] = $item$; continue _coreloop; }$1";
    // make some allowances for minification - there's only so far we can go with RegEx
    const filterBody = filterInfo.body
      .replace(/return false\s*([;}]|\}|$)/gi, filterPath1)
      .replace(/return!1([;}]|\}|$)/gi, filterPath1)
      .replace(/return true\s*([;}]|\}|$)/gi, filterPath2)
      .replace(/return!0([;}]|\}|$)/gi, filterPath2)
      .replace(
        /return ([^;}]+?)\s*([;}]|$)/gi,
        "{ if ((_cache[_i] = $1)) { _retval[_idx++] = $item$; }; continue _coreloop; }$2"
      );

    // This preserves the function template code after JS compression,
    // so that replace() commands still work as expected.
    let tpl = [
      // "function(_items, _args, _cache) { ",
      "let _retval = [], _idx = 0; ",
      "let $item$, $args$ = _args; ",
      "_coreloop: ",
      "for (let _i = 0, _il = _items.length; _i < _il; _i++) { ",
      "$item$ = _items[_i]; ",
      "if (_cache[_i]) { ",
      "_retval[_idx++] = $item$; ",
      "continue _coreloop; ",
      "} ",
      "$filter$; ",
      "} ",
      "return _retval; ",
      // "}"
    ].join("");
    tpl = tpl.replace(/\$filter\$/gi, filterBody);
    tpl = tpl.replace(/\$item\$/gi, filterInfo.params[0]);
    tpl = tpl.replace(/\$args\$/gi, filterInfo.params[1]);

    const fn = new Function("_items,_args,_cache", tpl) as any;
    fn.displayName = "compiledFilterWithCaching";
    return fn;
  }

  uncompiledFilter(items, args) {
    const retval = [] as any[];
    let idx = 0;

    if (this.filter) {
      for (let i = 0, ii = items.length; i < ii; i++) {
        if (this.filter(items[i], args)) {
          retval[idx++] = items[i];
        }
      }
    }

    return retval;
  }

  uncompiledFilterWithCaching(items, args, cache) {
    const retval = [] as any[];
    let idx = 0,
      item;

    const filter = this.filter || ((a, b) => false);

    for (let i = 0, ii = items.length; i < ii; i++) {
      item = items[i];
      if (cache[i]) {
        retval[idx++] = item;
      } else if (filter(item, args)) {
        retval[idx++] = item;
        cache[i] = true;
      }
    }

    return retval;
  }

  getFilteredAndPagedItems(items) {
    if (this.filter) {
      const batchFilter = this.options.inlineFilters
        ? this.compiledFilter
        : this.uncompiledFilter;
      const batchFilterWithCaching = this.options.inlineFilters
        ? this.compiledFilterWithCaching
        : this.uncompiledFilterWithCaching;

      if (this.refreshHints.isFilterNarrowing) {
        this.filteredItems = batchFilter(this.filteredItems, this.filterArgs);
      } else if (this.refreshHints.isFilterExpanding) {
        this.filteredItems = batchFilterWithCaching(
          items,
          this.filterArgs,
          this.filterCache
        );
      } else if (!this.refreshHints.isFilterUnchanged) {
        this.filteredItems = batchFilter(items, this.filterArgs);
      }
    } else {
      // special case:  if not filtering and not paging, the resulting
      // rows collection needs to be a copy so that changes due to sort
      // can be caught
      this.filteredItems = this.pagesize ? items : items.concat();
    }

    // get the current page
    let paged;
    if (this.pagesize) {
      if (this.filteredItems.length < this.pagenum * this.pagesize) {
        this.pagenum = Math.floor(this.filteredItems.length / this.pagesize);
      }
      paged = this.filteredItems.slice(
        this.pagesize * this.pagenum,
        this.pagesize * this.pagenum + this.pagesize
      );
    } else {
      paged = this.filteredItems;
    }

    return { totalRows: this.filteredItems.length, rows: paged };
  }

  getRowDiffs(rows, newRows) {
    let item, r, eitherIsNonData;
    const diff = [] as any[];
    let from = 0,
      to = newRows.length;

    if (this.refreshHints && this.refreshHints.ignoreDiffsBefore) {
      from = Math.max(
        0,
        Math.min(newRows.length, this.refreshHints.ignoreDiffsBefore)
      );
    }

    if (this.refreshHints && this.refreshHints.ignoreDiffsAfter) {
      to = Math.min(
        newRows.length,
        Math.max(0, this.refreshHints.ignoreDiffsAfter)
      );
    }

    for (let i = from, rl = rows.length; i < to; i++) {
      if (i >= rl) {
        diff[diff.length] = i;
      } else {
        item = newRows[i];
        r = rows[i];

        if (
          (this.groupingInfos.length &&
            (eitherIsNonData = item.__nonDataRow || r.__nonDataRow) &&
            item.__group !== r.__group) ||
          (item.__group && !item.equals(r)) ||
          (eitherIsNonData &&
            // no good way to compare totals since they are arbitrary DTOs
            // deep object comparison is pretty expensive
            // always considering them 'dirty' seems easier for the time being
            (item.__groupTotals || r.__groupTotals)) ||
          item[this.idProperty] != r[this.idProperty] ||
          (this.updated && this.updated[item[this.idProperty]])
        ) {
          diff[diff.length] = i;
        }
      }
    }
    return diff;
  }

  recalc(_items, filter?) {
    this.rowsById = null;

    if (
      this.refreshHints.isFilterNarrowing !=
        this.prevRefreshHints.isFilterNarrowing ||
      this.refreshHints.isFilterExpanding !=
        this.prevRefreshHints.isFilterExpanding
    ) {
      this.filterCache = [] as any[];
    }

    const filteredItems = this.getFilteredAndPagedItems(_items);
    this.totalRows = filteredItems.totalRows;
    let newRows = filteredItems.rows;

    this.groups = [] as any[];
    if (this.groupingInfos.length) {
      this.groups = this.extractGroups(newRows);
      if (this.groups.length) {
        this.addTotals(this.groups);
        newRows = this.flattenGroupedRows(this.groups);
      }
    }

    const diff = this.getRowDiffs(this.rows, newRows);

    this.rows = newRows;

    return diff;
  }

  refresh() {
    if (this.suspend) {
      return;
    }

    const countBefore = this.rows.length;
    const totalRowsBefore = this.totalRows;

    // pass as direct refs to avoid closure perf hit
    let diff = this.recalc(this.items, this.filter);

    // if the current page is no longer valid, go to last page and recalc
    // we suffer a performance penalty here, but the main loop (recalc) remains highly optimized
    if (this.pagesize && this.totalRows < this.pagenum * this.pagesize) {
      this.pagenum = Math.max(0, Math.ceil(this.totalRows / this.pagesize) - 1);
      diff = this.recalc(this.items, this.filter);
    }

    this.updated = null;
    this.prevRefreshHints = this.refreshHints;
    this.refreshHints = {} as AnyDict;

    if (totalRowsBefore !== this.totalRows) {
      this.onPagingInfoChanged.notify(this.getPagingInfo(), null, self);
    }
    if (countBefore !== this.rows.length) {
      this.onRowCountChanged.notify(
        { previous: countBefore, current: this.rows.length, dataView: self },
        null,
        self
      );
    }
    if (diff.length > 0) {
      this.onRowsChanged.notify({ rows: diff, dataView: self }, null, self);
    }
  }

  /** *
   * Wires the grid and the DataView together to keep row selection tied to item ids.
   * This is useful since, without it, the grid only knows about rows, so if the items
   * move around, the same rows stay selected instead of the selection moving along
   * with the items.
   *
   * NOTE:  This doesn't work with cell selection model.
   *
   * @param grid {Slick.Grid} The grid to sync selection with.
   * @param preserveHidden {Boolean} Whether to keep selected items that go out of the
   *     view due to them getting filtered out.
   * @param preserveHiddenOnSelectionChange {Boolean} Whether to keep selected items
   *     that are currently out of the view (see preserveHidden) as selected when selection
   *     changes.
   * @return {Slick.Event} An event that notifies when an internal list of selected row ids
   *     changes.  This is useful since, in combination with the above two options, it allows
   *     access to the full list selected row ids, and not just the ones visible to the grid.
   * @method syncGridSelection
   */
  syncGridSelection = (
    grid,
    preserveHidden,
    preserveHiddenOnSelectionChange
  ) => {
    let inHandler;
    let selectedRowIds = this.mapRowsToIds(grid.getSelectedRows());
    const onSelectedRowIdsChanged = new Slick.Event();

    const setSelectedRowIds = (rowIds) => {
      if (selectedRowIds.join(",") == rowIds.join(",")) {
        return;
      }

      selectedRowIds = rowIds;

      onSelectedRowIdsChanged.notify(
        {
          grid: grid,
          ids: selectedRowIds,
          dataView: self,
        },
        new Slick.EventData(),
        self
      );
    };

    const update = () => {
      if (selectedRowIds.length > 0) {
        inHandler = true;
        const selectedRows = this.mapIdsToRows(selectedRowIds);
        if (!preserveHidden) {
          setSelectedRowIds(this.mapRowsToIds(selectedRows));
        }
        grid.setSelectedRows(selectedRows);
        inHandler = false;
      }
    };

    grid.onSelectedRowsChanged.subscribe((e, args) => {
      if (inHandler) {
        return;
      }
      const newSelectedRowIds = this.mapRowsToIds(grid.getSelectedRows());
      if (!preserveHiddenOnSelectionChange || !grid.getOptions().multiSelect) {
        setSelectedRowIds(newSelectedRowIds);
      } else {
        // keep the ones that are hidden
        const existing = $.grep(selectedRowIds, (id) => {
          return this.getRowById(id) === undefined;
        });
        // add the newly selected ones
        setSelectedRowIds(existing.concat(newSelectedRowIds));
      }
    });

    this.onRowsChanged.subscribe(update);

    this.onRowCountChanged.subscribe(update);

    return onSelectedRowIdsChanged;
  };

  syncGridCellCssStyles(grid, key) {
    let hashById;
    let inHandler;

    const storeCellCssStyles = (hash) => {
      hashById = {} as AnyDict;
      for (const row in hash) {
        const id = this.rows[row][this.idProperty];
        hashById[id] = hash[row];
      }
    };

    // since this method can be called after the cell styles have been set,
    // get the existing ones right away
    storeCellCssStyles(grid.getCellCssStyles(key));

    const update = () => {
      if (hashById) {
        inHandler = true;
        this.ensureRowsByIdCache();
        const newHash = {} as AnyDict;
        for (const id in hashById) {
          const row = this.rowsById![id];
          if (row != undefined) {
            newHash[row] = hashById[id];
          }
        }
        grid.setCellCssStyles(key, newHash);
        inHandler = false;
      }
    };

    grid.onCellCssStylesChanged.subscribe(function (e, args) {
      if (inHandler) {
        return;
      }
      if (key != args.key) {
        return;
      }
      if (args.hash) {
        storeCellCssStyles(args.hash);
      }
    });

    this.onRowsChanged.subscribe(update);

    this.onRowCountChanged.subscribe(update);
  }
}

class AvgAggregator {
  private field_;
  private count_;
  private nonNullCount_;
  private sum_;

  constructor(field) {
    this.field_ = field;
  }

  init() {
    this.count_ = 0;
    this.nonNullCount_ = 0;
    this.sum_ = 0;
  }

  accumulate(item) {
    const val = item[this.field_];
    this.count_++;
    if (val != null && val !== "" && !isNaN(val)) {
      this.nonNullCount_++;
      this.sum_ += parseFloat(val);
    }
  }

  storeResult(groupTotals) {
    if (!groupTotals.avg) {
      groupTotals.avg = {} as AnyDict;
    }
    if (this.nonNullCount_ != 0) {
      groupTotals.avg[this.field_] = this.sum_ / this.nonNullCount_;
    }
  }
}

class MinAggregator {
  private field_;
  private min_;

  constructor(field) {
    this.field_ = field;
  }

  init() {
    this.min_ = null;
  }

  accumulate(item) {
    const val = item[this.field_];
    if (val != null && val !== "" && !isNaN(val)) {
      if (this.min_ == null || val < this.min_) {
        this.min_ = val;
      }
    }
  }

  storeResult(groupTotals) {
    if (!groupTotals.min) {
      groupTotals.min = {} as AnyDict;
    }
    groupTotals.min[this.field_] = this.min_;
  }
}

class MaxAggregator {
  private field_;
  private max_;

  constructor(field) {
    this.field_ = field;
  }

  init() {
    this.max_ = null;
  }

  accumulate(item) {
    const val = item[this.field_];
    if (val != null && val !== "" && !isNaN(val)) {
      if (this.max_ == null || val > this.max_) {
        this.max_ = val;
      }
    }
  }

  storeResult(groupTotals) {
    if (!groupTotals.max) {
      groupTotals.max = {} as AnyDict;
    }
    groupTotals.max[this.field_] = this.max_;
  }
}

class SumAggregator {
  private field_;
  private sum_;

  constructor(field) {
    this.field_ = field;
  }

  init() {
    this.sum_ = null;
  }

  accumulate(item) {
    const val = item[this.field_];
    if (val != null && val !== "" && !isNaN(val)) {
      this.sum_ += parseFloat(val);
    }
  }

  storeResult(groupTotals) {
    if (!groupTotals.sum) {
      groupTotals.sum = {} as AnyDict;
    }
    groupTotals.sum[this.field_] = this.sum_;
  }
}

const Aggregators = {
  Avg: AvgAggregator,
  Min: MinAggregator,
  Max: MaxAggregator,
  Sum: SumAggregator,
};

const Data = {
  DataView,
  GroupMetaDataProvider: GroupItemMetaDataProvider,
  Aggregators,
};

export default Data;
