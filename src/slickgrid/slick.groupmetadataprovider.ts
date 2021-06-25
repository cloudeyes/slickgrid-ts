import $ from "jquery";
import Slick from "./slick.core";
import SlickGrid from "./slick.grid";

interface Options {
  groupCssClass: string;
  groupTitleCssClass: string;
  totalsCssClass: string;
  groupFocusable: boolean;
  totalsFocusable: boolean;
  toggleCssClass: string;
  toggleExpandedCssClass: string;
  toggleCollapsedCssClass: string;
  enableExpandCollapse: boolean;
  groupFormatter: (row, cell, value, columnDef, item) => string;
  totalsFormatter: (row, cell, value, columnDef, item) => string;
}

/***
 * Provides item metadata for group (Slick.Group) and totals (Slick.Totals) rows produced by the DataView.
 * This metadata overrides the default behavior and formatting of those rows so that they appear and function
 * correctly when processed by the grid.
 *
 * This class also acts as a grid plugin providing event handlers to expand & collapse groups.
 * If "grid.registerPlugin(...)" is not called, expand & collapse will not work.
 *
 * @class GroupItemMetadataProvider
 * @module Data
 * @namespace Slick.Data
 * @constructor
 * @param options
 */
export default class GroupItemMetadataProvider {
  private options!: Options;

  constructor(options?: Options) {
    const _defaults = {
      groupCssClass: "slick-group",
      groupTitleCssClass: "slick-group-title",
      totalsCssClass: "slick-group-totals",
      groupFocusable: true,
      totalsFocusable: false,
      toggleCssClass: "slick-group-toggle",
      toggleExpandedCssClass: "expanded",
      toggleCollapsedCssClass: "collapsed",
      enableExpandCollapse: true,
      groupFormatter: this.defaultGroupCellFormatter,
      totalsFormatter: this.defaultTotalsCellFormatter,
    };

    this.options = $.extend(true, {}, _defaults, options || {});
  }

  private _grid;

  defaultGroupCellFormatter(row, cell, value, columnDef, item) {
    if (!this.options.enableExpandCollapse) {
      return item.title;
    }

    const indentation = item.level * 15 + "px";

    return (
      "<span class='" +
      this.options.toggleCssClass +
      " " +
      (item.collapsed
        ? this.options.toggleCollapsedCssClass
        : this.options.toggleExpandedCssClass) +
      "' style='margin-left:" +
      indentation +
      "'>" +
      "</span>" +
      "<span class='" +
      this.options.groupTitleCssClass +
      "' level='" +
      item.level +
      "'>" +
      item.title +
      "</span>"
    );
  }

  defaultTotalsCellFormatter(row, cell, value, columnDef, item) {
    return (
      (columnDef.groupTotalsFormatter &&
        columnDef.groupTotalsFormatter(item, columnDef)) ||
      ""
    );
  }

  init(grid) {
    this._grid = grid;
    this._grid.onClick.subscribe(this.handleGridClick);
    this._grid.onKeyDown.subscribe(this.handleGridKeyDown);
  }

  destroy() {
    if (this._grid) {
      this._grid.onClick.unsubscribe(this.handleGridClick);
      this._grid.onKeyDown.unsubscribe(this.handleGridKeyDown);
    }
  }

  handleGridClick(e, args) {
    const grid: SlickGrid = args.grid;
    const item = grid.getDataItem(args.row);
    if (
      item &&
      item instanceof Slick.Group &&
      $(e.target).hasClass(this.options.toggleCssClass)
    ) {
      const range = this._grid.getRenderedRange();
      grid.getData().setRefreshHints({
        ignoreDiffsBefore: range.top,
        ignoreDiffsAfter: range.bottom + 1,
      });

      if (item.collapsed) {
        grid.getData().expandGroup(item.groupingKey);
      } else {
        grid.getData().collapseGroup(item.groupingKey);
      }

      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }

  // TODO:  add -/+ handling
  handleGridKeyDown = (e, args) => {
    const grid: SlickGrid = args.grid;
    if (this.options.enableExpandCollapse && e.which == Slick.keyCode.SPACE) {
      const activeCell = grid.getActiveCell();
      if (activeCell) {
        const item = grid.getDataItem(activeCell.row);
        if (item && item instanceof Slick.Group) {
          const range = this._grid.getRenderedRange();
          grid.getData().setRefreshHints({
            ignoreDiffsBefore: range.top,
            ignoreDiffsAfter: range.bottom + 1,
          });

          if (item.collapsed) {
            grid.getData().expandGroup(item.groupingKey);
          } else {
            grid.getData().collapseGroup(item.groupingKey);
          }

          e.stopImmediatePropagation();
          e.preventDefault();
        }
      }
    }
  };

  getGroupRowMetadata(item) {
    return {
      selectable: false,
      focusable: this.options.groupFocusable,
      cssClasses: this.options.groupCssClass,
      columns: {
        0: {
          colspan: "*",
          formatter: this.options.groupFormatter,
          editor: null,
        },
      },
    };
  }

  getTotalsRowMetadata(item) {
    return {
      selectable: false,
      focusable: this.options.totalsFocusable,
      cssClasses: this.options.totalsCssClass,
      formatter: this.options.totalsFormatter,
      editor: null,
    };
  }
}
