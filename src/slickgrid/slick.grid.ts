/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable no-constant-condition */
/**
 * @license
 * (c) 2009-2013 Michael Leibman
 * michael{dot}leibman{at}gmail{dot}com
 * http://github.com/mleibman/slickgrid
 *
 * Distributed under MIT license.
 * All rights reserved.
 *
 * SlickGrid v2.2
 *
 * NOTES:
 *     Cell/row DOM manipulations are done directly bypassing jQuery's DOM manipulation methods.
 *     This increases the speed dramatically, but can only be done safely because there are no event handlers
 *     or data associated with any cell/row DOM nodes.  Cell editors must make sure they implement .destroy()
 *     and do proper cleanup.
 */

import $ from "jquery";
import interact from "interactjs";

import Slick from "./slick.core";

// shared across all grids on the page
let scrollbarDimensions;
let maxSupportedCssHeight; // browser's breaking point

// ////////////////////////////////////////////////////////////////////////////////////////////
// SlickGrid class implementation (available as Slick.Grid)

/**
 * Creates a new instance of the grid.
 * @class SlickGrid
 * @constructor
 * @param {Node}              container   Container node to create the grid in.
 * @param {Array,Object}      data        An array of objects for databinding.
 * @param {Array}             columns     An array of column definitions.
 * @param {Object}            options     Grid options.
 **/
export default class SlickGrid {

  private container;
  private data;
  private columns;
  private options;

  constructor(container, data, columns, options) {
    this.container = container;
    this.data = data;
    this.columns = columns;
    this.options = options;
    this._init();
  }

  // settings
  private defaults = {
    explicitInitialization: false,
    rowHeight: 25,
    defaultColumnWidth: 80,
    enableAddRow: false,
    leaveSpaceForNewRows: false,
    editable: false,
    autoEdit: true,
    enableCellNavigation: true,
    enableColumnReorder: true,
    asyncEditorLoading: false,
    asyncEditorLoadDelay: 100,
    forceFitColumns: false,
    enableAsyncPostRender: false,
    asyncPostRenderDelay: 50,
    enableAsyncPostRenderCleanup: false,
    asyncPostRenderCleanupDelay: 40,
    autoHeight: false,
    editorLock: Slick.GlobalEditorLock,
    showHeaderRow: false,
    headerRowHeight: 25,
    createFooterRow: false,
    showFooterRow: false,
    footerRowHeight: 25,
    showTopPanel: false,
    topPanelHeight: 25,
    formatterFactory: null,
    editorFactory: null,
    cellFlashingCssClass: "flashing",
    selectedCellCssClass: "selected",
    multiSelect: true,
    enableTextSelectionOnCells: false,
    dataItemColumnValueExtractor: null,
    fullWidthRows: false,
    multiColumnSort: false,
    defaultFormatter: this.defaultFormatter,
    forceSyncScrolling: false,
    addNewRowCssClass: "new-row",
  };

  private columnDefaults = {
    width: undefined as (number | undefined),
    name: "",
    resizable: true,
    sortable: false,
    minWidth: 30,
    rerenderOnResize: false,
    headerCssClass: null,
    defaultSortAsc: true,
    focusable: true,
    selectable: true,
  };

  // scroller
  private th; // virtual height
  private h; // real scrollable height
  private ph; // page height
  private n; // number of pages
  private cj; // "jumpiness" coefficient

  private page = 0; // current page
  private offset = 0; // current page offset
  private vScrollDir = 1;

  // private
  private initialized = false;
  private $container;
  private uid = "slickgrid_" + Math.round(1000000 * Math.random());
  private self = this;
  private $focusSink;
  private $focusSink2;
  private $headerScroller;
  private $headers;
  private $headerRow;
  private $headerRowScroller;
  private $headerRowSpacer;
  private $footerRow;
  private $footerRowScroller;
  private $footerRowSpacer;
  private $topPanelScroller;
  private $topPanel;
  private $viewport;
  private $canvas;
  private $style;
  private $boundAncestors;
  private stylesheet;
  private columnCssRulesL;
  private columnCssRulesR;
  private viewportH;
  private viewportW;
  private canvasWidth;
  private viewportHasHScroll;
  private viewportHasVScroll;
  private headerColumnWidthDiff = 0;

  private // border+padding
  headerColumnHeightDiff = 0;

  private cellWidthDiff = 0;
  private cellHeightDiff = 0;
  private jQueryNewWidthBehaviour = true;
  private absoluteColumnMinWidth;

  private tabbingDirection = 1;
  private activePosX;
  private activeRow;
  private activeCell;
  private activeCellNode = null;
  private currentEditor = null;
  private serializedEditorValue;
  private editController;

  private rowsCache = {};
  private renderedRows = 0;
  private numVisibleRows;
  private prevScrollTop = 0;
  private scrollTop = 0;
  private lastRenderedScrollTop = 0;
  private lastRenderedScrollLeft = 0;
  private prevScrollLeft = 0;
  private scrollLeft = 0;

  private selectionModel;
  private selectedRows  = [] as any[];

  private plugins  = [] as any[];
  private cellCssClasses = {};

  private columnsById = {};
  private sortColumns  = [] as any[];
  private columnPosLeft  = [] as any[];
  private columnPosRight  = [] as any[];

  // async call handles
  private h_editorLoader = null;
  private h_render = null;
  private h_postrender = null;
  private h_postrenderCleanup = null;
  private postProcessedRows = {};
  private postProcessToRow = null;
  private postProcessFromRow = null;
  private postProcessedCleanupQueue  = [] as any[];
  private postProcessgroupId = 0;

  // perf counters
  private counter_rows_rendered = 0;
  private counter_rows_removed = 0;

  // These two variables work around a bug with inertial scrolling in Webkit/Blink on Mac.
  // See http://crbug.com/312427.
  private rowNodeFromLastMouseWheelEvent; // this node must not be deleted while inertial scrolling
  private zombieRowNodeFromLastMouseWheelEvent; // node that was hidden instead of getting deleted
  private zombieRowCacheFromLastMouseWheelEvent; // row cache for above node
  private zombieRowPostProcessedFromLastMouseWheelEvent; // post processing references for above node

  // store css attributes if display:none is active in container or parent
  private cssShow = {
    position: "absolute",
    visibility: "hidden",
    display: "block",
  };
  private $hiddenParents;
  private oldProps  = [] as any[];

  // ////////////////////////////////////////////////////////////////////////////////////////////
  // Initialization

  ///
  private _init() {
    this.$container = $(this.container);
    if (this.$container.length < 1) {
      throw new Error(
        "SlickGrid requires a valid container, " +
          this.container +
          " does not exist in the DOM."
      );
    }

    this.cacheCssForHiddenInit();

    // calculate these only once and share between grid instances
    maxSupportedCssHeight = maxSupportedCssHeight || this.getMaxSupportedCssHeight();
    scrollbarDimensions = scrollbarDimensions || this.measureScrollbar();

    this.options = $.extend({}, this.defaults, this.options);
    this.validateAndEnforceOptions();
    this.columnDefaults.width = this.options.defaultColumnWidth;

    this.columnsById = {};
    for (let i = 0; i < this.columns.length; i++) {
      const m = (this.columns[i] = $.extend({}, this.columnDefaults, this.columns[i]));
      this.columnsById[m.id] = i;
      if (m.minWidth && m.width < m.minWidth) {
        m.width = m.minWidth;
      }
      if (m.maxWidth && m.width > m.maxWidth) {
        m.width = m.maxWidth;
      }
    }

    this.editController = {
      commitCurrentEdit: this.commitCurrentEdit,
      cancelCurrentEdit: this.cancelCurrentEdit,
    };

    this.$container
      .empty()
      .css("overflow", "hidden")
      .css("outline", 0)
      .addClass(this.uid)
      .addClass("ui-widget");

    // set up a positioning container if needed
    if (!/relative|absolute|fixed/.test(this.$container.css("position"))) {
      this.$container.css("position", "relative");
    }

    this.$focusSink = $(
      "<div tabIndex='0' hideFocus style='position:fixed;width:0;height:0;top:0;left:0;outline:0;'></div>"
    ).appendTo(this.$container);

    this.$headerScroller = $(
      "<div class='slick-header ui-state-default' style='overflow:hidden;position:relative;' />"
    ).appendTo(this.$container);
    this.$headers = $("<div class='slick-header-columns' />").appendTo(
      this.$headerScroller
    );
    this.$headers.width(this.getHeadersWidth());

    this.$headerRowScroller = $(
      "<div class='slick-headerrow ui-state-default' style='overflow:hidden;position:relative;' />"
    ).appendTo(this.$container);
    this.$headerRow = $("<div class='slick-headerrow-columns' />").appendTo(
      this.$headerRowScroller
    );
    this.$headerRowSpacer = $(
      "<div style='display:block;height:1px;position:absolute;top:0;left:0;'></div>"
    )
      .css("width", this.getCanvasWidth() + scrollbarDimensions.width + "px")
      .appendTo(this.$headerRowScroller);

    this.$topPanelScroller = $(
      "<div class='slick-top-panel-scroller ui-state-default' style='overflow:hidden;position:relative;' />"
    ).appendTo(this.$container);
    this.$topPanel = $(
      "<div class='slick-top-panel' style='width:10000px' />"
    ).appendTo(this.$topPanelScroller);

    if (!this.options.showTopPanel) {
      this.$topPanelScroller.hide();
    }

    if (!this.options.showHeaderRow) {
      this.$headerRowScroller.hide();
    }

    this.$viewport = $(
      "<div class='slick-viewport' style='width:100%;overflow:auto;outline:0;position:relative;;'>"
    ).appendTo(this.$container);
    this.$viewport.css("overflow-y", this.options.autoHeight ? "hidden" : "auto");

    this.$canvas = $("<div class='grid-canvas' />").appendTo(this.$viewport);

    if (this.options.createFooterRow) {
      this.$footerRowScroller = $(
        "<div class='slick-footerrow ui-state-default' style='overflow:hidden;position:relative;' />"
      ).appendTo(this.$container);
      this.$footerRow = $("<div class='slick-footerrow-columns' />").appendTo(
        this.$footerRowScroller
      );
      this.$footerRowSpacer = $(
        "<div style='display:block;height:1px;position:absolute;top:0;left:0;'></div>"
      )
        .css("width", this.getCanvasWidth() + scrollbarDimensions.width + "px")
        .appendTo(this.$footerRowScroller);

      if (!this.options.showFooterRow) {
        this.$footerRowScroller.hide();
      }
    }

    this.$focusSink2 = this.$focusSink.clone().appendTo(this.$container);

    if (!this.options.explicitInitialization) {
      this.init();
    }
  }

  ///
  init() {
    if (!this.initialized) {
      this.initialized = true;

      this.viewportW = parseFloat($.css(this.$container[0], "width", true));

      // header columns and cells may have different padding/border skewing width calculations (box-sizing, hello?)
      // calculate the diff so we can set consistent sizes
      this.measureCellPaddingAndBorder();

      // for usability reasons, all text selection in SlickGrid is disabled
      // with the exception of input and textarea elements (selection must
      // be enabled there so that editors work as expected); note that
      // selection in grid cells (grid body) is already unavailable in
      // all browsers except IE
      this.disableSelection(this.$headers); // disable all text selection in header (including input and textarea)

      if (!this.options.enableTextSelectionOnCells) {
        // disable text selection in grid cells except in input and textarea elements
        // (this is IE-specific, because selectstart event will only fire in IE)
        this.$viewport.bind("selectstart.ui", event => $(event.target).is("input,textarea"));
      }

      this.updateColumnCaches();
      this.createColumnHeaders();
      this.setupColumnSort();
      this.createCssRules();
      this.resizeCanvas();
      this.bindAncestorScrollEvents();

      this.$container.bind("resize.slickgrid", this.resizeCanvas);
      this.$viewport
        // .bind("click", handleClick)
        .bind("scroll", this.handleScroll);
      this.$headerScroller
        .bind("contextmenu", this.handleHeaderContextMenu)
        .bind("click", this.handleHeaderClick)
        .delegate(".slick-header-column", "mouseenter", this.handleHeaderMouseEnter)
        .delegate(".slick-header-column", "mouseleave", this.handleHeaderMouseLeave);
      this.$headerRowScroller.bind("scroll", this.handleHeaderRowScroll);

      if (this.options.createFooterRow) {
        this.$footerRowScroller.bind("scroll", this.handleFooterRowScroll);
      }

      this.$focusSink.add(this.$focusSink2).bind("keydown", this.handleKeyDown);
      this.$canvas
        .bind("keydown", this.handleKeyDown)
        .bind("click", this.handleClick)
        .bind("dblclick", this.handleDblClick)
        .bind("contextmenu", this.handleContextMenu)
        .delegate(".slick-cell", "mouseenter", this.handleMouseEnter)
        .delegate(".slick-cell", "mouseleave", this.handleMouseLeave);

      // legacy support for drag events
      (interact as any)(this.$canvas[0])
        .allowFrom("div.slick-cell")
        .draggable({
          onmove: this.handleDrag,
          onstart: this.handleDragStart,
          onend: this.handleDragEnd,
        })
        .styleCursor(false);

      // Work around http://crbug.com/312427.
      if (
        navigator.userAgent.toLowerCase().match(/webkit/) &&
        navigator.userAgent.toLowerCase().match(/macintosh/)
      ) {
        this.$canvas.bind("mousewheel", this.handleMouseWheel);
      }
      this.restoreCssFromHiddenInit();
    }
  }

  ///
  private cacheCssForHiddenInit() {
    const self = this;
    // handle display:none on container or container parents
    this.$hiddenParents = this.$container.parents().addBack().not(":visible");
    this.$hiddenParents.each(function (this: any) {
      const old = {};
      let name;
      for(name in self.cssShow) {
        old[name] = this.style[name];
        this.style[name] = self.cssShow[name];
      }
      self.oldProps.push(old);
    });
  }

  ///
  private restoreCssFromHiddenInit() {
    const self = this;
    // finish handle display:none on container or container parents
    // - put values back the way they were
    this.$hiddenParents.each(function (this: any, i) {
      const old = self.oldProps[i];
      let name;
      for(name in self.cssShow) {
        this.style[name] = old[name];
      }
    });
  }

  ///
  registerPlugin(plugin) {
    this.plugins.unshift(plugin);
    plugin.init(self);
  }

  ///
  unregisterPlugin(plugin) {
    for (let i = this.plugins.length; i >= 0; i--) {
      if (this.plugins[i] === plugin) {
        if (this.plugins[i].destroy) {
          this.plugins[i].destroy();
        }
        this.plugins.splice(i, 1);
        break;
      }
    }
  }

  ///
  setSelectionModel(model) {
    if (this.selectionModel) {
      this.selectionModel.onSelectedRangesChanged.unsubscribe(
        this.handleSelectedRangesChanged
      );
      if (this.selectionModel.destroy) {
        this.selectionModel.destroy();
      }
    }

    this.selectionModel = model;
    if (this.selectionModel) {
      this.selectionModel.init(self);
      this.selectionModel.onSelectedRangesChanged.subscribe(
        this.handleSelectedRangesChanged
      );
    }
  }

  ///
  getSelectionModel() {
    return this.selectionModel;
  }

  ///
  getCanvasNode() {
    return this.$canvas[0];
  }

  ///
  private measureScrollbar() {
    const $c = $(
      "<div style='position:absolute; top:-10000px; left:-10000px; width:100px; height:100px; overflow:scroll;'></div>"
    ).appendTo("body");
    const dim = {
      width: $c.width()! - $c[0].clientWidth,
      height: $c.height()! - $c[0].clientHeight,
    };
    $c.remove();
    return dim;
  }

  ///
  private getHeadersWidth() {
    let headersWidth = 0;
    for (let i = 0, ii = this.columns.length; i < ii; i++) {
      const width = this.columns[i].width;
      headersWidth += width;
    }
    headersWidth += scrollbarDimensions.width;
    return Math.max(headersWidth, this.viewportW) + 1000;
  }

  ///
  private getCanvasWidth() {
    const availableWidth = this.viewportHasVScroll
      ? this.viewportW - scrollbarDimensions.width
      : this.viewportW;
    let rowWidth = 0;
    let i = this.columns.length;
    while (i--) {
      rowWidth += this.columns[i].width;
    }
    return this.options.fullWidthRows
      ? Math.max(rowWidth, availableWidth)
      : rowWidth;
  }

  ///
  private updateCanvasWidth(forceColumnWidthsUpdate) {
    const oldCanvasWidth = this.canvasWidth;
    this.canvasWidth = this.getCanvasWidth();

    if (this.canvasWidth != oldCanvasWidth) {
      this.$canvas.width(this.canvasWidth);
      this.$headerRow.width(this.canvasWidth);
      if (this.options.createFooterRow) {
        this.$footerRow.width(this.canvasWidth);
      }
      this.$headers.width(this.getHeadersWidth());
      this.viewportHasHScroll = this.canvasWidth > this.viewportW - scrollbarDimensions.width;
    }

    const w = this.canvasWidth + (this.viewportHasVScroll ? scrollbarDimensions.width : 0);
    this.$headerRowSpacer.width(w);
    if (this.options.createFooterRow) {
      this.$footerRowSpacer.width(w);
    }

    if (this.canvasWidth != oldCanvasWidth || forceColumnWidthsUpdate) {
      this.applyColumnWidths();
    }
  }

  ///
  private disableSelection($target) {
    if ($target && $target.jquery) {
      $target
        .attr("unselectable", "on")
        .css("MozUserSelect", "none")
        .bind("selectstart.ui", () => false); // from jquery:ui.core.js 1.7.2
    }
  }

  ///
  private getMaxSupportedCssHeight() {
    let supportedHeight = 1000000;
    // FF reports the height back but still renders blank after ~6M px
    const testUpTo = navigator.userAgent.toLowerCase().match(/firefox/)
      ? 6000000
      : 1000000000;
    const div = $("<div style='display:none' />").appendTo(document.body);

    while (true) {
      const test = supportedHeight * 2;
      div.css("height", test);
      if (test > testUpTo || div.height() !== test) {
        break;
      } else {
        supportedHeight = test;
      }
    }

    div.remove();
    return supportedHeight;
  }

  // TODO:  this is static.  need to handle page mutation.
  ///
  private bindAncestorScrollEvents() {
    let elem = this.$canvas[0];
    while ((elem = elem.parentNode) != document.body && elem != null) {
      // bind to scroll containers only
      if (
        elem == this.$viewport[0] ||
        elem.scrollWidth != elem.clientWidth ||
        elem.scrollHeight != elem.clientHeight
      ) {
        const $elem = $(elem);
        if (!this.$boundAncestors) {
          this.$boundAncestors = $elem;
        } else {
          this.$boundAncestors = this.$boundAncestors.add($elem);
        }
        $elem.bind("scroll." + this.uid, this.handleActiveCellPositionChange);
      }
    }
  }

  ///
  private unbindAncestorScrollEvents() {
    if (!this.$boundAncestors) {
      return;
    }
    this.$boundAncestors.unbind("scroll." + this.uid);
    this.$boundAncestors = null;
  }

  ///
  updateColumnHeader(columnId, title, toolTip) {
    if (!this.initialized) {
      return;
    }
    const idx = this.getColumnIndex(columnId);
    if (idx == null) {
      return;
    }

    const columnDef = this.columns[idx];
    const $header = this.$headers.children().eq(idx);
    if ($header) {
      if (title !== undefined) {
        this.columns[idx].name = title;
      }
      if (toolTip !== undefined) {
        this.columns[idx].toolTip = toolTip;
      }

      this.trigger(this.onBeforeHeaderCellDestroy, {
        node: $header[0],
        column: columnDef,
        grid: self,
      });

      $header
        .attr("title", toolTip || "")
        .children()
        .eq(0)
        .html(title);

      this.trigger(this.onHeaderCellRendered, {
        node: $header[0],
        column: columnDef,
        grid: self,
      });
    }
  }

  ///
  getHeaderRow() {
    return this.$headerRow[0];
  }

  ///
  getFooterRow() {
    return this.$footerRow[0];
  }

  ///
  getHeaderRowColumn(columnId) {
    const idx = this.getColumnIndex(columnId);
    const $header = this.$headerRow.children().eq(idx);
    return $header && $header[0];
  }

  ///
  getFooterRowColumn(columnId) {
    const idx = this.getColumnIndex(columnId);
    const $footer = this.$footerRow.children().eq(idx);
    return $footer && $footer[0];
  }

  ///
  private createColumnHeaders() {
    const self = this;
    function onMouseEnter(this: any) {
      $(this).addClass("ui-state-hover");
    }

    function onMouseLeave(this: any) {
      $(this).removeClass("ui-state-hover");
    }

    this.$headers.find(".slick-header-column").each(function (this: any) {
      const columnDef = $(this).data("column");
      if (columnDef) {
        self.trigger(self.onBeforeHeaderCellDestroy, {
          node: this,
          column: columnDef,
          grid: self,
        });
      }
    });
    this.$headers.empty();
    this.$headers.width(this.getHeadersWidth());

    this.$headerRow.find(".slick-headerrow-column").each(function (this: any) {
      const columnDef = $(this).data("column");
      if (columnDef) {
        self.trigger(self.onBeforeHeaderRowCellDestroy, {
          node: this,
          column: columnDef,
          grid: self,
        });
      }
    });
    this.$headerRow.empty();

    if (this.options.createFooterRow) {
      this.$footerRow.find(".slick-footerrow-column").each(function (this: any) {
        const columnDef = $(this).data("column");
        if (columnDef) {
          self.trigger(self.onBeforeFooterRowCellDestroy, {
            node: this,
            column: columnDef,
          });
        }
      });
      this.$footerRow.empty();
    }

    this.columns.forEach((m, i) => {
      const header = $("<div class='ui-state-default slick-header-column' />")
        .html("<span class='slick-column-name'>" + m.name + "</span>")
        .width(m.width - this.headerColumnWidthDiff)
        .attr("id", "" + this.uid + m.id)
        .attr("title", m.toolTip || "")
        .data("column", m)
        .addClass(m.headerCssClass || "")
        .appendTo(this.$headers);

      if (this.options.enableColumnReorder || m.sortable) {
        header.on("mouseenter", onMouseEnter).on("mouseleave", onMouseLeave);
      }

      if (m.sortable) {
        header.addClass("slick-header-sortable");
        header.append("<span class='slick-sort-indicator' />");
      }

      self.trigger(self.onHeaderCellRendered, {
        node: header[0],
        column: m,
        grid: self,
      });

      if (this.options.showHeaderRow) {
        const headerRowCell = $(
          "<div class='ui-state-default slick-headerrow-column l" +
            i +
            " r" +
            i +
            "'></div>"
        )
          .data("column", m)
          .appendTo(this.$headerRow);

        self.trigger(self.onHeaderRowCellRendered, {
          node: headerRowCell[0],
          column: m,
          grid: self,
        });
      }
      if (this.options.createFooterRow && this.options.showFooterRow) {
        const footerRowCell = $(
          "<div class='ui-state-default slick-footerrow-column l" +
            i +
            " r" +
            i +
            "'></div>"
        )
          .data("column", m)
          .appendTo(this.$footerRow);

        self.trigger(self.onFooterRowCellRendered, {
          node: footerRowCell[0],
          column: m,
        });
      }
    });

    this.setSortColumns(this.sortColumns);
    this.setupColumnResize();
    if (this.options.enableColumnReorder) {
      this.setupColumnReorder();
    }
  }

  ///
  private setupColumnSort() {
    this.$headers.click(e => {
      // temporary workaround for a bug in jQuery 1.7.1 (http://bugs.jquery.com/ticket/11328)
      e.metaKey = e.metaKey || e.ctrlKey;

      if ($(e.target).hasClass("slick-resizable-handle")) {
        return;
      }

      const $col = $(e.target).closest(".slick-header-column");
      if (!$col.length) {
        return;
      }

      const column = $col.data("column");
      if (column.sortable) {
        if (!this.getEditorLock().commitCurrentEdit()) {
          return;
        }

        let sortOpts;
        let i = 0;
        for (; i < this.sortColumns.length; i++) {
          if (this.sortColumns[i].columnId == column.id) {
            sortOpts = this.sortColumns[i];
            sortOpts.sortAsc = !sortOpts.sortAsc;
            break;
          }
        }

        if (e.metaKey && this.options.multiColumnSort) {
          if (sortOpts) {
            this.sortColumns.splice(i, 1);
          }
        } else {
          if ((!e.shiftKey && !e.metaKey) || !this.options.multiColumnSort) {
            this.sortColumns  = [] as any[];
          }

          if (!sortOpts) {
            sortOpts = { columnId: column.id, sortAsc: column.defaultSortAsc };
            this.sortColumns.push(sortOpts);
          } else if (this.sortColumns.length == 0) {
            this.sortColumns.push(sortOpts);
          }
        }

        this.setSortColumns(this.sortColumns);

        if (!this.options.multiColumnSort) {
          this.trigger(
            this.onSort,
            {
              multiColumnSort: false,
              sortCol: column,
              sortAsc: sortOpts.sortAsc,
              grid: self,
            },
            e
          );
        } else {
          this.trigger(
            this.onSort,
            {
              multiColumnSort: true,
              sortCols: $.map(this.sortColumns, col => ({
                sortCol: this.columns[this.getColumnIndex(col.columnId)],
                sortAsc: col.sortAsc
              })),
              grid: self,
            },
            e
          );
        }
      }
    });
  }

  /**
   * Refactored to use interactjs
   */
  ///
  private setupColumnReorder() {
    const self = this;
    let x = 0;
    let delta = 0;
    let placeholder = document.createElement("div");

    placeholder.className = "interact-placeholder";

    (interact as any)(".slick-header-column", { context: this.$container[0] })
      .ignoreFrom(".slick-resizable-handle")
      .draggable({
        inertia: true,
        // keep the element within the area of it's parent
        restrict: {
          restriction: "parent",
          endOnly: true,
          elementRect: { top: 0, left: 0, bottom: 0, right: 0 },
        },
        // enable autoScroll
        autoScroll: true,
        axis: "x",
        onstart: (event) => {
          x = 0;
          delta = event.target.offsetWidth;

          // get old order
          this.$headers.find(".slick-header-column").each(function (this: any, index) {
            $(this).data("index", index);
          });

          placeholder.style.height = event.target.offsetHeight + "px";
          placeholder.style.width = delta + "px";

          $(event.target)
            .after(placeholder)
            .css({
              position: "absolute",
              zIndex: 1000,
              marginLeft: $(event.target).position().left,
            });
        },

        onmove: (event) => {
          x += event.dx;
          event.target.style.transform = `translate3d(${x}px, -3px, 100px)`;
          // event.target.style.marginLeft = x + 'px';
        },

        onend: (event) => {
          x = 0;
          delta = 0;
          $(event.target).css({
            position: "relative",
            zIndex: "",
            marginLeft: 0,
            transform: "none",
          });

          placeholder.parentNode!.removeChild(placeholder);
          const newColumns  = [] as any[];

          this.$headers.find(".slick-header-column").each(function (this: any, index) {
            newColumns.push(self.columns[$(this).data("index")]);
            $(this).removeData("index");
          });

          this.setColumns(newColumns);
          self.trigger(self.onColumnsReordered, { grid: self });
          this.setupColumnResize();
        },
      })
      .dropzone({
        accept: ".slick-header-column",

        ondragenter: (event) => {
          event.target.classList.add("interact-drop-active");
          event.relatedTarget.classList.add("interact-can-drop");
        },

        ondragleave: (event) => {
          event.target.classList.remove("interact-drop-active");
          event.relatedTarget.classList.remove("interact-can-drop");
        },

        ondrop: (event) => {
          event.target.classList.remove("interact-drop-active");
          event.relatedTarget.classList.remove("interact-can-drop");
          $(event.target)[x > 0 ? "after" : "before"](event.relatedTarget);
        },
      })
      .styleCursor(false);
  }

  ///
  private setupColumnResize() {
    let $col;
    let j;
    let c;
    let pageX;
    let columnElements;
    let minPageX;
    let maxPageX;
    let firstResizable;
    let lastResizable;
    columnElements = this.$headers.children();
    columnElements.find(".slick-resizable-handle").remove();
    columnElements.each((i, e) => {
      if (this.columns[i].resizable) {
        if (firstResizable === undefined) {
          firstResizable = i;
        }
        lastResizable = i;
      }
    });
    if (firstResizable === undefined) {
      return;
    }
    columnElements.each((i, element) => {
      if (
        i < firstResizable ||
        (this.options.forceFitColumns && i >= lastResizable)
      ) {
        return;
      }
      $col = $(element);

      const $handle = $("<div class='slick-resizable-handle' />");
      $handle.appendTo(element);

      if ($col.data("resizable")) return;

      const activeColumn = this.columns[i];
      if (activeColumn.resizable) {
        $col.data("resizable", true);
        (interact as any)(element)
          .resizable({
            preserveAspectRatio: false,
            edges: { left: true, right: true, bottom: false, top: false },
          })
          .on("resizestart", event => {
            if (!this.getEditorLock().commitCurrentEdit()) {
              return false;
            }
            activeColumn.previousWidth = event.rect.width;
            event.target.classList.add("slick-header-column-active");
          })
          .on("resizemove", event => {
            let x = event.dx;
            let width = (activeColumn.width += x);

            if (activeColumn.minWidth > 0 && activeColumn.minWidth > width)
              width = activeColumn.minWidth;
            else if (activeColumn.maxWidth > 0 && activeColumn.maxWidth < width)
              width = activeColumn.maxWidth;

            activeColumn.width = width;

            if (this.options.forceFitColumns) {
              this.autosizeColumns();
            }
            this.applyColumnHeaderWidths();
            if (this.options.syncColumnCellResize) {
              this.applyColumnWidths();
            }
          })
          .on("resizeend", event => {
            event.target.classList.remove("slick-header-column-active");
            this.invalidateAllRows();
            this.updateCanvasWidth(true);
            this.render();
            this.trigger(this.onColumnsResized, { grid: self });
          });
      }
    });
  }

  ///
  private getVBoxDelta($el) {
    const p = [
      "borderTopWidth",
      "borderBottomWidth",
      "paddingTop",
      "paddingBottom",
    ];
    let delta = 0;
    $.each(p, (n, val) => {
      delta += parseFloat($el.css(val)) || 0;
    });
    return delta;
  }

  ///
  private measureCellPaddingAndBorder() {
    let el;
    const h = [
      "borderLeftWidth",
      "borderRightWidth",
      "paddingLeft",
      "paddingRight",
    ];
    const v = [
      "borderTopWidth",
      "borderBottomWidth",
      "paddingTop",
      "paddingBottom",
    ];

    // jquery prior to version 1.8verArray[0] >= 2;

    el = $(
      "<div class='ui-state-default slick-header-column' style='visibility:hidden'>-</div>"
    ).appendTo(this.$headers);
    this.headerColumnWidthDiff = this.headerColumnHeightDiff = 0;
    if (
      el.css("box-sizing") != "border-box" &&
      el.css("-moz-box-sizing") != "border-box" &&
      el.css("-webkit-box-sizing") != "border-box"
    ) {
      $.each(h, (n, val) => {
        this.headerColumnWidthDiff += parseFloat(el.css(val)) || 0;
      });
      $.each(v, (n, val) => {
        this.headerColumnHeightDiff += parseFloat(el.css(val)) || 0;
      });
    }
    el.remove();

    const r = $("<div class='slick-row' />").appendTo(this.$canvas);
    el = $(
      "<div class='slick-cell' id='' style='visibility:hidden'>-</div>"
    ).appendTo(r);
    this.cellWidthDiff = this.cellHeightDiff = 0;
    if (
      el.css("box-sizing") != "border-box" &&
      el.css("-moz-box-sizing") != "border-box" &&
      el.css("-webkit-box-sizing") != "border-box"
    ) {
      $.each(h, (n, val) => {
        this.cellWidthDiff += parseFloat(el.css(val)) || 0;
      });
      $.each(v, (n, val) => {
        this.cellHeightDiff += parseFloat(el.css(val)) || 0;
      });
    }
    r.remove();

    this.absoluteColumnMinWidth = Math.max(this.headerColumnWidthDiff, this.cellWidthDiff);
  }

  ///
  private createCssRules() {
    this.$style = $("<style type='text/css' rel='stylesheet' />").appendTo(
      $("head")
    );
    const rowHeight = this.options.rowHeight - this.cellHeightDiff;
    const rules = [
      "." + this.uid + " .slick-header-column { left: 0; }",
      "." +
        this.uid +
        " .slick-top-panel { height:" +
        this.options.topPanelHeight +
        "px; }",
      "." +
        this.uid +
        " .slick-headerrow-columns { height:" +
        this.options.headerRowHeight +
        "px; }",
      "." +
        this.uid +
        " .slick-footerrow-columns { height:" +
        this.options.footerRowHeight +
        "px; }",
      "." + this.uid + " .slick-cell { height:" + rowHeight + "px; }",
      "." + this.uid + " .slick-row { height:" + this.options.rowHeight + "px; }",
    ];

    for (let i = 0; i < this.columns.length; i++) {
      rules.push("." + this.uid + " .l" + i + " { }");
      rules.push("." + this.uid + " .r" + i + " { }");
    }

    if (this.$style[0].styleSheet) {
      // IE
      this.$style[0].styleSheet.cssText = rules.join(" ");
    } else {
      this.$style[0].appendChild(document.createTextNode(rules.join(" ")));
    }
  }

  ///
  private getColumnCssRules(idx) {
    if (!this.stylesheet) {
      const sheets = document.styleSheets;
      for (var i = 0; i < sheets.length; i++) {
        if ((sheets[i].ownerNode || sheets[i]["owningElement"]) == this.$style[0]) {
          this.stylesheet = sheets[i];
          break;
        }
      }

      if (!this.stylesheet) {
        throw new Error("Cannot find stylesheet.");
      }

      // find and cache column CSS rules
      this.columnCssRulesL  = [] as any[];
      this.columnCssRulesR  = [] as any[];
      const cssRules = this.stylesheet.cssRules || this.stylesheet.rules;
      let matches;
      let columnIdx;
      for (var i = 0; i < cssRules.length; i++) {
        const selector = cssRules[i].selectorText;
        if ((matches = /\.l\d+/.exec(selector))) {
          columnIdx = parseInt(matches[0].substr(2, matches[0].length - 2), 10);
          this.columnCssRulesL[columnIdx] = cssRules[i];
        } else if ((matches = /\.r\d+/.exec(selector))) {
          columnIdx = parseInt(matches[0].substr(2, matches[0].length - 2), 10);
          this.columnCssRulesR[columnIdx] = cssRules[i];
        }
      }
    }

    return {
      left: this.columnCssRulesL[idx],
      right: this.columnCssRulesR[idx],
    };
  }

  ///
  private removeCssRules() {
    this.$style.remove();
    this.stylesheet = null;
  }

  ///
  destroy() {
    this.getEditorLock().cancelCurrentEdit();

    this.trigger(this.onBeforeDestroy, { grid: self });

    let i = this.plugins.length;
    while (i--) {
      this.unregisterPlugin(this.plugins[i]);
    }

    this.unbindAncestorScrollEvents();
    this.$container.unbind(".slickgrid");
    this.removeCssRules();

    this.$container.empty().removeClass(this.uid);
  }

  // ////////////////////////////////////////////////////////////////////////////////////////////
  // General

  ///
  private trigger(evt, args, e?) {
    e = e || new Slick.EventData();
    args = args || {};
    args.grid = self;
    return evt.notify(args, e, self);
  }

  ///
  getEditorLock() {
    return this.options.editorLock;
  }

  ///
  getEditController() {
    return this.editController;
  }

  ///
  getColumnIndex(id) {
    return this.columnsById[id];
  }

  ///
  autosizeColumns() {
    let i;
    let c;
    const widths  = [] as any[];
    let shrinkLeeway = 0;
    let total = 0;
    let prevTotal;

    const availWidth = this.viewportHasVScroll
      ? this.viewportW - scrollbarDimensions.width
      : this.viewportW;

    for (i = 0; i < this.columns.length; i++) {
      c = this.columns[i];
      widths.push(c.width);
      total += c.width;
      if (c.resizable) {
        shrinkLeeway += c.width - Math.max(c.minWidth, this.absoluteColumnMinWidth);
      }
    }

    // shrink
    prevTotal = total;
    while (total > availWidth && shrinkLeeway) {
      const shrinkProportion = (total - availWidth) / shrinkLeeway;
      for (i = 0; i < this.columns.length && total > availWidth; i++) {
        c = this.columns[i];
        const width = widths[i];
        if (
          !c.resizable ||
          width <= c.minWidth ||
          width <= this.absoluteColumnMinWidth
        ) {
          continue;
        }
        const absMinWidth = Math.max(c.minWidth, this.absoluteColumnMinWidth);
        let shrinkSize =
          Math.floor(shrinkProportion * (width - absMinWidth)) || 1;
        shrinkSize = Math.min(shrinkSize, width - absMinWidth);
        total -= shrinkSize;
        shrinkLeeway -= shrinkSize;
        widths[i] -= shrinkSize;
      }
      if (prevTotal <= total) {
        // avoid infinite loop
        break;
      }
      prevTotal = total;
    }

    // grow
    prevTotal = total;
    while (total < availWidth) {
      const growProportion = availWidth / total;
      for (i = 0; i < this.columns.length && total < availWidth; i++) {
        c = this.columns[i];
        const currentWidth = widths[i];
        let growSize;

        if (!c.resizable || c.maxWidth <= currentWidth) {
          growSize = 0;
        } else {
          growSize =
            Math.min(
              Math.floor(growProportion * currentWidth) - currentWidth,
              c.maxWidth - currentWidth || 1000000
            ) || 1;
        }
        total += growSize;
        widths[i] += total <= availWidth ? growSize : 0;
      }
      if (prevTotal >= total) {
        // avoid infinite loop
        break;
      }
      prevTotal = total;
    }

    let reRender = false;
    for (i = 0; i < this.columns.length; i++) {
      if (this.columns[i].rerenderOnResize && this.columns[i].width != widths[i]) {
        reRender = true;
      }
      this.columns[i].width = widths[i];
    }

    this.applyColumnHeaderWidths();
    this.updateCanvasWidth(true);
    if (reRender) {
      this.invalidateAllRows();
      this.render();
    }
  }

  ///
  private applyColumnHeaderWidths() {
    if (!this.initialized) {
      return;
    }
    let h;
    for (
      let i = 0, headers = this.$headers.children("[id]"), ii = headers.length;
      i < ii;
      i++
    ) {
      h = $(headers[i]);
      if (this.jQueryNewWidthBehaviour) {
        if (h.outerWidth() !== this.columns[i].width) {
          h.outerWidth(this.columns[i].width);
        }
      } else {
        if (h.width() !== this.columns[i].width - this.headerColumnWidthDiff) {
          h.width(this.columns[i].width - this.headerColumnWidthDiff);
        }
      }
    }

    this.updateColumnCaches();
  }

  ///
  private applyColumnWidths() {
    let x = 0;
    let w;
    let rule;
    for (let i = 0; i < this.columns.length; i++) {
      w = this.columns[i].width;

      rule = this.getColumnCssRules(i);
      rule.left.style.left = x + "px";
      rule.right.style.right = this.canvasWidth - x - w + "px";

      x += this.columns[i].width;
    }
  }

  ///
  setSortColumn(columnId, ascending) {
    this.setSortColumns([{ columnId: columnId, sortAsc: ascending }]);
  }

  ///
  setSortColumns(cols) {
    this.sortColumns = cols;

    const headerColumnEls = this.$headers.children();
    headerColumnEls
      .removeClass("slick-header-column-sorted")
      .find(".slick-sort-indicator")
      .removeClass("slick-sort-indicator-asc slick-sort-indicator-desc");

    $.each(this.sortColumns, (i, col) => {
      if (col.sortAsc == null) {
        col.sortAsc = true;
      }
      const columnIndex = this.getColumnIndex(col.columnId);
      if (columnIndex != null) {
        headerColumnEls
          .eq(columnIndex)
          .addClass("slick-header-column-sorted")
          .find(".slick-sort-indicator")
          .addClass(
            col.sortAsc
              ? "slick-sort-indicator-asc"
              : "slick-sort-indicator-desc"
          );
      }
    });
  }

  ///
  getSortColumns() {
    return this.sortColumns;
  }

  ///
  private handleSelectedRangesChanged(e, ranges) {
    this.selectedRows  = [] as any[];
    const hash = {};
    for (let i = 0; i < ranges.length; i++) {
      for (let j = ranges[i].fromRow; j <= ranges[i].toRow; j++) {
        if (!hash[j]) {
          // prevent duplicates
          this.selectedRows.push(j);
          hash[j] = {};
        }
        for (let k = ranges[i].fromCell; k <= ranges[i].toCell; k++) {
          if (this.canCellBeSelected(j, k)) {
            hash[j][this.columns[k].id] = this.options.selectedCellCssClass;
          }
        }
      }
    }

    this.setCellCssStyles(this.options.selectedCellCssClass, hash);

    this.trigger(
      this.onSelectedRowsChanged,
      { rows: this.getSelectedRows(), grid: self },
      e
    );
  }

  ///
  getColumns() {
    return this.columns;
  }

  ///
  private updateColumnCaches() {
    // Pre-calculate cell boundaries.
    this.columnPosLeft  = [] as any[];
    this.columnPosRight  = [] as any[];
    let x = 0;
    for (let i = 0, ii = this.columns.length; i < ii; i++) {
      this.columnPosLeft[i] = x;
      this.columnPosRight[i] = x + this.columns[i].width;
      x += this.columns[i].width;
    }
  }

  ///
  setColumns(columnDefinitions) {
    this.columns = columnDefinitions;

    this.columnsById = {};
    for (let i = 0; i < this.columns.length; i++) {
      const m = (this.columns[i] = $.extend({}, this.columnDefaults, this.columns[i]));
      this.columnsById[m.id] = i;
      if (m.minWidth && m.width < m.minWidth) {
        m.width = m.minWidth;
      }
      if (m.maxWidth && m.width > m.maxWidth) {
        m.width = m.maxWidth;
      }
    }

    this.updateColumnCaches();

    if (this.initialized) {
      this.invalidateAllRows();
      this.createColumnHeaders();
      this.removeCssRules();
      this.createCssRules();
      this.resizeCanvas();
      this.applyColumnWidths();
      this.handleScroll();
    }
  }

  ///
  getOptions() {
    return this.options;
  }

  ///
  setOptions(args) {
    if (!this.getEditorLock().commitCurrentEdit()) {
      return;
    }

    this.makeActiveCellNormal();

    if (this.options.enableAddRow !== args.enableAddRow) {
      this.invalidateRow(this.getDataLength());
    }

    this.options = $.extend(this.options, args);
    this.validateAndEnforceOptions();

    this.$viewport.css("overflow-y", this.options.autoHeight ? "hidden" : "auto");
    this.render();
  }

  ///
  private validateAndEnforceOptions() {
    if (this.options.autoHeight) {
      this.options.leaveSpaceForNewRows = false;
    }
  }

  ///
  setData(newData, scrollToTop) {
    this.data = newData;
    this.invalidateAllRows();
    this.updateRowCount();
    if (scrollToTop) {
      this.scrollTo(0);
    }
  }

  ///
  getData() {
    return this.data;
  }

  ///
  getDataLength() {
    if (this.data.getLength) {
      return this.data.getLength();
    } else {
      return this.data.length;
    }
  }

  ///
  private getDataLengthIncludingAddNew() {
    return this.getDataLength() + (this.options.enableAddRow ? 1 : 0);
  }

  ///
  getDataItem(i) {
    if (this.data.getItem) {
      return this.data.getItem(i);
    } else {
      return this.data[i];
    }
  }

  ///
  getTopPanel() {
    return this.$topPanel[0];
  }

  ///
  setTopPanelVisibility(visible) {
    if (this.options.showTopPanel != visible) {
      this.options.showTopPanel = visible;
      if (visible) {
        this.$topPanelScroller.slideDown("fast", this.resizeCanvas);
      } else {
        this.$topPanelScroller.slideUp("fast", this.resizeCanvas);
      }
    }
  }

  ///
  setHeaderRowVisibility(visible) {
    if (this.options.showHeaderRow != visible) {
      this.options.showHeaderRow = visible;
      if (visible) {
        this.$headerRowScroller.slideDown("fast", this.resizeCanvas);
      } else {
        this.$headerRowScroller.slideUp("fast", this.resizeCanvas);
      }
    }
  }

  ///
  setFooterRowVisibility(visible) {
    if (this.options.showFooterRow != visible) {
      this.options.showFooterRow = visible;
      if (visible) {
        this.$footerRowScroller.slideDown("fast", this.resizeCanvas);
      } else {
        this.$footerRowScroller.slideUp("fast", this.resizeCanvas);
      }
    }
  }

  ///
  getContainerNode() {
    return this.$container.get(0);
  }

  // ////////////////////////////////////////////////////////////////////////////////////////////
  // Rendering / Scrolling

  ///
  private getRowTop(row) {
    return this.options.rowHeight * row - this.offset;
  }

  ///
  private getRowFromPosition(y) {
    return Math.floor((y + this.offset) / this.options.rowHeight);
  }

  ///
  private scrollTo(y) {
    y = Math.max(y, 0);
    y = Math.min(
      y,
      this.th - this.viewportH + (this.viewportHasHScroll ? scrollbarDimensions.height : 0)
    );

    const oldOffset = this.offset;

    this.page = Math.min(this.n - 1, Math.floor(y / this.ph));
    this.offset = Math.round(this.page * this.cj);
    const newScrollTop = y - this.offset;

    if (this.offset != oldOffset) {
      const range = this.getVisibleRange(newScrollTop);
      this.cleanupRows(range);
      this.updateRowPositions();
    }

    if (this.prevScrollTop != newScrollTop) {
      this.vScrollDir = this.prevScrollTop + oldOffset < newScrollTop + this.offset ? 1 : -1;
      this.$viewport[0].scrollTop =
        this.lastRenderedScrollTop =
        this.scrollTop =
        this.prevScrollTop =
          newScrollTop;

      this.trigger(this.onViewportChanged, { grid: self });
    }
  }

  ///
  private defaultFormatter(row, cell, value, columnDef, dataContext) {
    if (value == null) {
      return "";
    } else {
      return (value + "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
  }

  ///
  private getFormatter(row, column) {
    const rowMetadata = this.data.getItemMetadata && this.data.getItemMetadata(row);

    // look up by id, then index
    const columnOverrides =
      rowMetadata &&
      rowMetadata.columns &&
      (rowMetadata.columns[column.id] ||
        rowMetadata.columns[this.getColumnIndex(column.id)]);

    return (
      (columnOverrides && columnOverrides.formatter) ||
      (rowMetadata && rowMetadata.formatter) ||
      column.formatter ||
      (this.options.formatterFactory &&
        this.options.formatterFactory.getFormatter(column)) ||
      this.options.defaultFormatter
    );
  }

  ///
  private getEditor(row, cell) {
    const column = this.columns[cell];
    const rowMetadata = this.data.getItemMetadata && this.data.getItemMetadata(row);
    const columnMetadata = rowMetadata && rowMetadata.columns;

    if (
      columnMetadata &&
      columnMetadata[column.id] &&
      columnMetadata[column.id].editor !== undefined
    ) {
      return columnMetadata[column.id].editor;
    }
    if (
      columnMetadata &&
      columnMetadata[cell] &&
      columnMetadata[cell].editor !== undefined
    ) {
      return columnMetadata[cell].editor;
    }

    return (
      column.editor ||
      (this.options.editorFactory && this.options.editorFactory.getEditor(column))
    );
  }

  ///
  private getDataItemValueForColumn(item, columnDef) {
    if (this.options.dataItemColumnValueExtractor) {
      return this.options.dataItemColumnValueExtractor(item, columnDef);
    }
    return item[columnDef.field];
  }

  ///
  private appendRowHtml(stringArray, row, range, dataLength) {
    const d = this.getDataItem(row);
    const dataLoading = row < dataLength && !d;
    let rowCss =
      "slick-row" +
      (dataLoading ? " loading" : "") +
      (row === this.activeRow ? " active" : "") +
      (row % 2 == 1 ? " odd" : " even");

    if (!d) {
      rowCss += " " + this.options.addNewRowCssClass;
    }

    const metadata = this.data.getItemMetadata && this.data.getItemMetadata(row);

    if (metadata && metadata.cssClasses) {
      rowCss += " " + metadata.cssClasses;
    }

    stringArray.push(
      "<div class='ui-widget-content " +
        rowCss +
        "' style='top:" +
        this.getRowTop(row) +
        "px'>"
    );

    let colspan;
    let m;
    for (let i = 0, ii = this.columns.length; i < ii; i++) {
      m = this.columns[i];
      colspan = 1;
      if (metadata && metadata.columns) {
        const columnData = metadata.columns[m.id] || metadata.columns[i];
        colspan = (columnData && columnData.colspan) || 1;
        if (colspan === "*") {
          colspan = ii - i;
        }
      }

      // Do not render cells outside of the viewport.
      if (this.columnPosRight[Math.min(ii - 1, i + colspan - 1)] > range.leftPx) {
        if (this.columnPosLeft[i] > range.rightPx) {
          // All columns to the right are outside the range.
          break;
        }

        this.appendCellHtml(stringArray, row, i, colspan, d);
      }

      if (colspan > 1) {
        i += colspan - 1;
      }
    }

    stringArray.push("</div>");
  }

  ///
  private appendCellHtml(stringArray, row, cell, colspan, item) {
    // stringArray: stringBuilder containing the HTML parts
    // row, cell: row and column index
    // colspan: HTML colspan
    // item: grid data for row

    const m = this.columns[cell];
    let cellCss =
      "slick-cell l" +
      cell +
      " r" +
      Math.min(this.columns.length - 1, cell + colspan - 1) +
      (m.cssClass ? " " + m.cssClass : "");
    if (row === this.activeRow && cell === this.activeCell) {
      cellCss += " active";
    }

    // TODO:  merge them together in the setter
    let key;
    for(key in this.cellCssClasses) {
      if (this.cellCssClasses[key][row] && this.cellCssClasses[key][row][m.id]) {
        cellCss += " " + this.cellCssClasses[key][row][m.id];
      }
    }

    stringArray.push("<div class='" + cellCss + "'>");

    // if there is a corresponding row (if not, this is the Add New row or this data hasn't been loaded yet)
    if (item) {
      const value = this.getDataItemValueForColumn(item, m);
      stringArray.push(this.getFormatter(row, m)(row, cell, value, m, item));
    }

    stringArray.push("</div>");

    this.rowsCache[row].cellRenderQueue.push(cell);
    this.rowsCache[row].cellColSpans[cell] = colspan;
  }

  ///
  private cleanupRows(rangeToKeep) {
    let i;
    for(i in this.rowsCache) {
      if (
        (i = parseInt(i, 10)) !== this.activeRow &&
        (i < rangeToKeep.top || i > rangeToKeep.bottom)
      ) {
        this.removeRowFromCache(i);
      }
    }
    if (this.options.enableAsyncPostRenderCleanup) {
      this.startPostProcessingCleanup();
    }
  }

  ///
  invalidate() {
    this.updateRowCount();
    this.invalidateAllRows();
    this.render();
  }

  ///
  invalidateAllRows() {
    if (this.currentEditor) {
      this.makeActiveCellNormal();
    }
    let row;
    for(row in this.rowsCache) {
      this.removeRowFromCache(row);
    }
    if (this.options.enableAsyncPostRenderCleanup) {
      this.startPostProcessingCleanup();
    }
  }

  ///
  private queuePostProcessedRowForCleanup(
    cacheEntry,
    postProcessedRow,
    rowIdx
  ) {
    this.postProcessgroupId++;

    // store and detach node for later async cleanup
    let columnIdx;
    for(columnIdx in postProcessedRow) {
      if (postProcessedRow.hasOwnProperty(columnIdx)) {
        this.postProcessedCleanupQueue.push({
          actionType: "C",
          groupId: this.postProcessgroupId,
          node: cacheEntry.cellNodesByColumnIdx[columnIdx | 0],
          columnIdx: columnIdx | 0,
          rowIdx: rowIdx,
        });
      }
    }
    this.postProcessedCleanupQueue.push({
      actionType: "R",
      groupId: this.postProcessgroupId,
      node: cacheEntry.rowNode,
    });
    $(cacheEntry.rowNode).detach();
  }

  ///
  private queuePostProcessedCellForCleanup(cellnode, columnIdx, rowIdx) {
    this.postProcessedCleanupQueue.push({
      actionType: "C",
      groupId: this.postProcessgroupId,
      node: cellnode,
      columnIdx: columnIdx,
      rowIdx: rowIdx,
    });
    $(cellnode).detach();
  }

  ///
  private removeRowFromCache(row) {
    const cacheEntry = this.rowsCache[row];
    if (!cacheEntry) {
      return;
    }

    if (this.rowNodeFromLastMouseWheelEvent === cacheEntry.rowNode) {
      cacheEntry.rowNode.style.display = "none";
      this.zombieRowNodeFromLastMouseWheelEvent = this.rowNodeFromLastMouseWheelEvent;
      this.zombieRowCacheFromLastMouseWheelEvent = cacheEntry;
      this.zombieRowPostProcessedFromLastMouseWheelEvent = this.postProcessedRows[row];
      // ignore post processing cleanup in this case - it will be dealt with later
    } else {
      if (this.options.enableAsyncPostRenderCleanup && this.postProcessedRows[row]) {
        this.queuePostProcessedRowForCleanup(
          cacheEntry,
          this.postProcessedRows[row],
          row
        );
      } else {
        this.$canvas[0].removeChild(cacheEntry.rowNode);
      }
    }

    delete this.rowsCache[row];
    delete this.postProcessedRows[row];
    this.renderedRows--;
    this.counter_rows_removed++;
  }

  ///
  invalidateRows(rows) {
    let i;
    let rl;
    if (!rows || !rows.length) {
      return;
    }
    this.vScrollDir = 0;
    for (i = 0, rl = rows.length; i < rl; i++) {
      if (this.currentEditor && this.activeRow === rows[i]) {
        this.makeActiveCellNormal();
      }
      if (this.rowsCache[rows[i]]) {
        this.removeRowFromCache(rows[i]);
      }
    }
    if (this.options.enableAsyncPostRenderCleanup) {
      this.startPostProcessingCleanup();
    }
  }

  ///
  invalidateRow(row) {
    this.invalidateRows([row]);
  }

  ///
  updateCell(row, cell) {
    const cellNode = this.getCellNode(row, cell);
    if (!cellNode) {
      return;
    }

    const m = this.columns[cell];
    const d = this.getDataItem(row);
    if (this.currentEditor && this.activeRow === row && this.activeCell === cell) {
      this.currentEditor.loadValue(d);
    } else {
      cellNode.innerHTML = d
        ? this.getFormatter(row, m)(row, cell, this.getDataItemValueForColumn(d, m), m, d)
        : "";
      this.invalidatePostProcessingResults(row);
    }
  }

  ///
  updateRow(row) {
    const cacheEntry = this.rowsCache[row];
    if (!cacheEntry) {
      return;
    }

    this.ensureCellNodesInRowsCache(row);

    const d = this.getDataItem(row);
     let columnIdx;
     for(columnIdx in cacheEntry.cellNodesByColumnIdx) {
      if (!cacheEntry.cellNodesByColumnIdx.hasOwnProperty(columnIdx)) {
        continue;
      }

      columnIdx = columnIdx | 0;
      const m = this.columns[columnIdx];
      const node = cacheEntry.cellNodesByColumnIdx[columnIdx];

      if (row === this.activeRow && columnIdx === this.activeCell && this.currentEditor) {
        this.currentEditor.loadValue(d);
      } else if (d) {
        node.innerHTML = this.getFormatter(row, m)(
          row,
          columnIdx,
          this.getDataItemValueForColumn(d, m),
          m,
          d
        );
      } else {
        node.innerHTML = "";
      }
    }

    this.invalidatePostProcessingResults(row);
  }

  ///
  private getViewportHeight() {
    return (
      parseFloat($.css(this.$container[0], "height", true)) -
      parseFloat($.css(this.$container[0], "paddingTop", true)) -
      parseFloat($.css(this.$container[0], "paddingBottom", true)) -
      parseFloat($.css(this.$headerScroller[0], "height")) -
      this.getVBoxDelta(this.$headerScroller) -
      (this.options.showTopPanel
        ? this.options.topPanelHeight + this.getVBoxDelta(this.$topPanelScroller)
        : 0) -
      (this.options.showHeaderRow
        ? this.options.headerRowHeight + this.getVBoxDelta(this.$headerRowScroller)
        : 0) -
      (this.options.createFooterRow && this.options.showFooterRow
        ? this.options.footerRowHeight + this.getVBoxDelta(this.$footerRowScroller)
        : 0)
    );
  }

  ///
  resizeCanvas() {
    if (!this.initialized) {
      return;
    }
    if (this.options.autoHeight) {
      this.viewportH = this.options.rowHeight * this.getDataLengthIncludingAddNew();
    } else {
      this.viewportH = this.getViewportHeight();
    }

    this.numVisibleRows = Math.ceil(this.viewportH / this.options.rowHeight);
    this.viewportW = parseFloat($.css(this.$container[0], "width", true));
    if (!this.options.autoHeight) {
      this.$viewport.height(this.viewportH);
    }

    if (this.options.forceFitColumns) {
      this.autosizeColumns();
    }

    this.updateRowCount();
    this.handleScroll();
    // Since the width has changed, force the render() to reevaluate virtually rendered cells.
    this.lastRenderedScrollLeft = -1;
    this.render();
  }

  ///
  updateRowCount() {
    if (!this.initialized) {
      return;
    }

    const dataLengthIncludingAddNew = this.getDataLengthIncludingAddNew();
    const numberOfRows =
      dataLengthIncludingAddNew +
      (this.options.leaveSpaceForNewRows ? this.numVisibleRows - 1 : 0);

    const oldViewportHasVScroll = this.viewportHasVScroll;
    // with autoHeight, we do not need to accommodate the vertical scroll bar
    this.viewportHasVScroll =
      !this.options.autoHeight && numberOfRows * this.options.rowHeight > this.viewportH;
    this.viewportHasHScroll = this.canvasWidth > this.viewportW - scrollbarDimensions.width;

    this.makeActiveCellNormal();

    // remove the rows that are now outside of the data range
    // this helps avoid redundant calls to .removeRow() when the size of the data decreased by thousands of rows
    const l = dataLengthIncludingAddNew - 1;
    let i;
    for(i in this.rowsCache) {
      if (i > l) {
        this.removeRowFromCache(i);
      }
    }
    if (this.options.enableAsyncPostRenderCleanup) {
      this.startPostProcessingCleanup();
    }

    if (this.activeCellNode && this.activeRow > l) {
      this.resetActiveCell();
    }

    const oldH = this.h;
    this.th = Math.max(
      this.options.rowHeight * numberOfRows,
      this.viewportH - scrollbarDimensions.height
    );
    if (this.th < maxSupportedCssHeight) {
      // just one page
      this.h = this.ph = this.th;
      this.n = 1;
      this.cj = 0;
    } else {
      // break into pages
      this.h = maxSupportedCssHeight;
      this.ph = this.h / 100;
      this.n = Math.floor(this.th / this.ph);
      this.cj = (this.th - this.h) / (this.n - 1);
    }

    if (this.h !== oldH) {
      this.$canvas.css("height", this.h);
      this.scrollTop = this.$viewport[0].scrollTop;
    }

    const oldScrollTopInRange = this.scrollTop + this.offset <= this.th - this.viewportH;

    if (this.th == 0 || this.scrollTop == 0) {
      this.page = this.offset = 0;
    } else if (oldScrollTopInRange) {
      // maintain virtual position
      this.scrollTo(this.scrollTop + this.offset);
    } else {
      // scroll to bottom
      this.scrollTo(this.th - this.viewportH);
    }

    if (this.h != oldH && this.options.autoHeight) {
      this.resizeCanvas();
    }

    if (
      this.options.forceFitColumns &&
      oldViewportHasVScroll != this.viewportHasVScroll
    ) {
      this.autosizeColumns();
    }
    this.updateCanvasWidth(false);
  }

  ///
  getVisibleRange(viewportTop, viewportLeft?) {
    if (viewportTop == null) {
      viewportTop = this.scrollTop;
    }
    if (viewportLeft == null) {
      viewportLeft = this.scrollLeft;
    }

    return {
      top: this.getRowFromPosition(viewportTop),
      bottom: this.getRowFromPosition(viewportTop + this.viewportH) + 1,
      leftPx: viewportLeft,
      rightPx: viewportLeft + this.viewportW,
    };
  }

  ///
  getRenderedRange(viewportTop, viewportLeft) {
    const range = this.getVisibleRange(viewportTop, viewportLeft);
    const buffer = Math.round(this.viewportH / this.options.rowHeight);
    const minBuffer = 3;

    if (this.vScrollDir == -1) {
      range.top -= buffer;
      range.bottom += minBuffer;
    } else if (this.vScrollDir == 1) {
      range.top -= minBuffer;
      range.bottom += buffer;
    } else {
      range.top -= minBuffer;
      range.bottom += minBuffer;
    }

    range.top = Math.max(0, range.top);
    range.bottom = Math.min(this.getDataLengthIncludingAddNew() - 1, range.bottom);

    range.leftPx -= this.viewportW;
    range.rightPx += this.viewportW;

    range.leftPx = Math.max(0, range.leftPx);
    range.rightPx = Math.min(this.canvasWidth, range.rightPx);

    return range;
  }

  ///
  private ensureCellNodesInRowsCache(row) {
    const cacheEntry = this.rowsCache[row];
    if (cacheEntry) {
      if (cacheEntry.cellRenderQueue.length) {
        let lastChild = cacheEntry.rowNode.lastChild;
        while (cacheEntry.cellRenderQueue.length) {
          const columnIdx = cacheEntry.cellRenderQueue.pop();
          cacheEntry.cellNodesByColumnIdx[columnIdx] = lastChild;
          lastChild = lastChild.previousSibling;
        }
      }
    }
  }

  ///
  private cleanUpCells(range, row) {
    let totalCellsRemoved = 0;
    const cacheEntry = this.rowsCache[row];

    // Remove cells outside the range.
    const cellsToRemove  = [] as any[];
    let i;
    for(i in cacheEntry.cellNodesByColumnIdx) {
      // I really hate it when people mess with Array.prototype.
      if (!cacheEntry.cellNodesByColumnIdx.hasOwnProperty(i)) {
        continue;
      }

      // This is a string, so it needs to be cast back to a number.
      i = i | 0;

      const colspan = cacheEntry.cellColSpans[i];
      if (
        this.columnPosLeft[i] > range.rightPx ||
        this.columnPosRight[Math.min(this.columns.length - 1, i + colspan - 1)] <
          range.leftPx
      ) {
        if (!(row == this.activeRow && i == this.activeCell)) {
          cellsToRemove.push(i);
        }
      }
    }

    let cellToRemove;
    let node;
    this.postProcessgroupId++;
    while ((cellToRemove = cellsToRemove.pop()) != null) {
      node = cacheEntry.cellNodesByColumnIdx[cellToRemove];
      if (
        this.options.enableAsyncPostRenderCleanup &&
        this.postProcessedRows[row] &&
        this.postProcessedRows[row][cellToRemove]
      ) {
        this.queuePostProcessedCellForCleanup(node, cellToRemove, row);
      } else {
        cacheEntry.rowNode.removeChild(node);
      }

      delete cacheEntry.cellColSpans[cellToRemove];
      delete cacheEntry.cellNodesByColumnIdx[cellToRemove];
      if (this.postProcessedRows[row]) {
        delete this.postProcessedRows[row][cellToRemove];
      }
      totalCellsRemoved++;
    }
  }

  ///
  private cleanUpAndRenderCells(range) {
    let cacheEntry;
    const stringArray  = [] as any[];
    const processedRows  = [] as any[];
    let cellsAdded;
    let totalCellsAdded = 0;
    let colspan;

    for (let row = range.top, btm = range.bottom; row <= btm; row++) {
      cacheEntry = this.rowsCache[row];
      if (!cacheEntry) {
        continue;
      }

      // cellRenderQueue populated in renderRows() needs to be cleared first
      this.ensureCellNodesInRowsCache(row);

      this.cleanUpCells(range, row);

      // Render missing cells.
      cellsAdded = 0;

      let metadata = this.data.getItemMetadata && this.data.getItemMetadata(row);
      metadata = metadata && metadata.columns;

      const d = this.getDataItem(row);

      // TODO:  shorten this loop (index? heuristics? binary search?)
      for (let i = 0, ii = this.columns.length; i < ii; i++) {
        // Cells to the right are outside the range.
        if (this.columnPosLeft[i] > range.rightPx) {
          break;
        }

        // Already rendered.
        if ((colspan = cacheEntry.cellColSpans[i]) != null) {
          i += colspan > 1 ? colspan - 1 : 0;
          continue;
        }

        colspan = 1;
        if (metadata) {
          const columnData = metadata[this.columns[i].id] || metadata[i];
          colspan = (columnData && columnData.colspan) || 1;
          if (colspan === "*") {
            colspan = ii - i;
          }
        }

        if (this.columnPosRight[Math.min(ii - 1, i + colspan - 1)] > range.leftPx) {
          this.appendCellHtml(stringArray, row, i, colspan, d);
          cellsAdded++;
        }

        i += colspan > 1 ? colspan - 1 : 0;
      }

      if (cellsAdded) {
        totalCellsAdded += cellsAdded;
        processedRows.push(row);
      }
    }

    if (!stringArray.length) {
      return;
    }

    const x = document.createElement("div");
    x.innerHTML = stringArray.join("");

    let processedRow;
    let node;
    while ((processedRow = processedRows.pop()) != null) {
      cacheEntry = this.rowsCache[processedRow];
      let columnIdx;
      while ((columnIdx = cacheEntry.cellRenderQueue.pop()) != null) {
        node = x.lastChild;
        cacheEntry.rowNode.appendChild(node);
        cacheEntry.cellNodesByColumnIdx[columnIdx] = node;
      }
    }
  }

  ///
  private renderRows(range) {
    const parentNode = this.$canvas[0];
    const stringArray  = [] as any[];
    const rows  = [] as any[];
    let needToReselectCell = false;
    const dataLength = this.getDataLength();

    for (var i = range.top, ii = range.bottom; i <= ii; i++) {
      if (this.rowsCache[i]) {
        continue;
      }
      this.renderedRows++;
      rows.push(i);

      // Create an entry right away so that appendRowHtml() can
      // start populatating it.
      this.rowsCache[i] = {
        rowNode: null,

        // ColSpans of rendered cells (by column idx).
        // Can also be used for checking whether a cell has been rendered.
        cellColSpans: [],

        // Cell nodes (by column idx).  Lazy-populated by ensureCellNodesInRowsCache().
        cellNodesByColumnIdx: [],

        // Column indices of cell nodes that have been rendered, but not yet indexed in
        // cellNodesByColumnIdx.  These are in the same order as cell nodes added at the
        // end of the row.
        cellRenderQueue: [],
      };

      this.appendRowHtml(stringArray, i, range, dataLength);
      if (this.activeCellNode && this.activeRow === i) {
        needToReselectCell = true;
      }
      this.counter_rows_rendered++;
    }

    if (!rows.length) {
      return;
    }

    const x = document.createElement("div");
    x.innerHTML = stringArray.join("");

    for (var i = 0, ii = rows.length; i < ii; i++) {
      this.rowsCache[rows[i]].rowNode = parentNode.appendChild(x.firstChild);
    }

    if (needToReselectCell) {
      this.activeCellNode = this.getCellNode(this.activeRow, this.activeCell);
    }
  }

  ///
  private startPostProcessing() {
    if (!this.options.enableAsyncPostRender) {
      return;
    }
    clearTimeout(this.h_postrender);
    this.h_postrender = setTimeout(
      this.asyncPostProcessRows,
      this.options.asyncPostRenderDelay
    );
  }

  ///
  private startPostProcessingCleanup() {
    if (!this.options.enableAsyncPostRenderCleanup) {
      return;
    }
    clearTimeout(this.h_postrenderCleanup);
    this.h_postrenderCleanup = setTimeout(
      this.asyncPostProcessCleanupRows,
      this.options.asyncPostRenderCleanupDelay
    );
  }

  ///
  private invalidatePostProcessingResults(row) {
    // change status of columns to be re-rendered
    let columnIdx;
    for(columnIdx in this.postProcessedRows[row]) {
      if (this.postProcessedRows[row].hasOwnProperty(columnIdx)) {
        this.postProcessedRows[row][columnIdx] = "C";
      }
    }
    this.postProcessFromRow = Math.min(this.postProcessFromRow, row);
    this.postProcessToRow = Math.max(this.postProcessToRow, row);
    this.startPostProcessing();
  }

  ///
  private updateRowPositions() {
    let row;
    for(row in this.rowsCache) {
      this.rowsCache[row].rowNode.style.top = this.getRowTop(row) + "px";
    }
  }

  ///
  render() {
    if (!this.initialized) {
      return;
    }
    const visible = this.getVisibleRange();
    const rendered = this.getRenderedRange();

    // remove rows no longer in the viewport
    this.cleanupRows(rendered);

    // add new rows & missing cells in existing rows
    if (this.lastRenderedScrollLeft != this.scrollLeft) {
      this.cleanUpAndRenderCells(rendered);
    }

    // render missing rows
    this.renderRows(rendered);

    this.postProcessFromRow = visible.top;
    this.postProcessToRow = Math.min(
      this.getDataLengthIncludingAddNew() - 1,
      visible.bottom
    );
    this.startPostProcessing();

    this.lastRenderedScrollTop = this.scrollTop;
    this.lastRenderedScrollLeft = this.scrollLeft;
    this.h_render = null;
  }

  ///
  private handleHeaderRowScroll() {
    const scrollLeft = this.$headerRowScroller[0].scrollLeft;
    if (scrollLeft != this.$viewport[0].scrollLeft) {
      this.$viewport[0].scrollLeft = scrollLeft;
    }
  }

  ///
  private handleFooterRowScroll() {
    const scrollLeft = this.$footerRowScroller[0].scrollLeft;
    if (scrollLeft != this.$viewport[0].scrollLeft) {
      this.$viewport[0].scrollLeft = scrollLeft;
    }
  }

  ///
  private handleScroll() {
    this.scrollTop = this.$viewport[0].scrollTop;
    this.scrollLeft = this.$viewport[0].scrollLeft;
    const vScrollDist = Math.abs(this.scrollTop - this.prevScrollTop);
    const hScrollDist = Math.abs(this.scrollLeft - this.prevScrollLeft);

    if (hScrollDist) {
      this.prevScrollLeft = this.scrollLeft;
      this.$headerScroller[0].scrollLeft = this.scrollLeft;
      this.$topPanelScroller[0].scrollLeft = this.scrollLeft;
      this.$headerRowScroller[0].scrollLeft = this.scrollLeft;
      if (this.options.createFooterRow) {
        this.$footerRowScroller[0].scrollLeft = this.scrollLeft;
      }
    }

    if (vScrollDist) {
      this.vScrollDir = this.prevScrollTop < this.scrollTop ? 1 : -1;
      this.prevScrollTop = this.scrollTop;

      // switch virtual pages if needed
      if (vScrollDist < this.viewportH) {
        this.scrollTo(this.scrollTop + this.offset);
      } else {
        const oldOffset = this.offset;
        if (this.h == this.viewportH) {
          this.page = 0;
        } else {
          this.page = Math.min(
            this.n - 1,
            Math.floor(
              this.scrollTop * ((this.th - this.viewportH) / (this.h - this.viewportH)) * (1 / this.ph)
            )
          );
        }
        this.offset = Math.round(this.page * this.cj);
        if (oldOffset != this.offset) {
          this.invalidateAllRows();
        }
      }
    }

    if (hScrollDist || vScrollDist) {
      if (this.h_render) {
        clearTimeout(this.h_render);
      }

      if (
        Math.abs(this.lastRenderedScrollTop - this.scrollTop) > 20 ||
        Math.abs(this.lastRenderedScrollLeft - this.scrollLeft) > 20
      ) {
        if (
          this.options.forceSyncScrolling ||
          (Math.abs(this.lastRenderedScrollTop - this.scrollTop) < this.viewportH &&
            Math.abs(this.lastRenderedScrollLeft - this.scrollLeft) < this.viewportW)
        ) {
          this.render();
        } else {
          this.h_render = setTimeout(this.render, 50);
        }

        this.trigger(this.onViewportChanged, { grid: self });
      }
    }

    this.trigger(this.onScroll, {
      scrollLeft: this.scrollLeft,
      scrollTop: this.scrollTop,
      grid: self,
    });
  }

  ///
  private asyncPostProcessRows() {
    const dataLength = this.getDataLength();
    while (this.postProcessFromRow <= this.postProcessToRow) {
      const row = this.vScrollDir >= 0 ? this.postProcessFromRow++ : this.postProcessToRow--;
      const cacheEntry = this.rowsCache[row];
      if (!cacheEntry || row >= dataLength) {
        continue;
      }

      if (!this.postProcessedRows[row]) {
        this.postProcessedRows[row] = {};
      }

      this.ensureCellNodesInRowsCache(row);
      let columnIdx;
      for(columnIdx in cacheEntry.cellNodesByColumnIdx) {
        if (!cacheEntry.cellNodesByColumnIdx.hasOwnProperty(columnIdx)) {
          continue;
        }

        columnIdx = columnIdx | 0;

        const m = this.columns[columnIdx];
        const processedStatus = this.postProcessedRows[row][columnIdx]; // C=cleanup and re-render, R=rendered
        if (m.asyncPostRender && processedStatus !== "R") {
          const node = cacheEntry.cellNodesByColumnIdx[columnIdx];
          if (node) {
            m.asyncPostRender(
              node,
              row,
              this.getDataItem(row),
              m,
              processedStatus === "C"
            );
          }
          this.postProcessedRows[row][columnIdx] = "R";
        }
      }

      this.h_postrender = setTimeout(
        this.asyncPostProcessRows,
        this.options.asyncPostRenderDelay
      );
      return;
    }
  }

  ///
  private asyncPostProcessCleanupRows() {
    if (this.postProcessedCleanupQueue.length > 0) {
      const groupId = this.postProcessedCleanupQueue[0].groupId;

      // loop through all queue members with this groupID
      while (
        this.postProcessedCleanupQueue.length > 0 &&
        this.postProcessedCleanupQueue[0].groupId == groupId
      ) {
        const entry = this.postProcessedCleanupQueue.shift();
        if (entry.actionType == "R") {
          $(entry.node).remove();
        }
        if (entry.actionType == "C") {
          const column = this.columns[entry.columnIdx];
          if (column.asyncPostRenderCleanup && entry.node) {
            // cleanup must also remove element
            column.asyncPostRenderCleanup(entry.node, entry.rowIdx, column);
          }
        }
      }

      // call this function again after the specified delay
      this.h_postrenderCleanup = setTimeout(
        this.asyncPostProcessCleanupRows,
        this.options.asyncPostRenderCleanupDelay
      );
    }
  }

  ///
  private updateCellCssStylesOnRenderedRows(addedHash, removedHash) {
    let node;
    let columnId;
    let addedRowHash;
    let removedRowHash;
    let row;
    for(row in this.rowsCache) {
      removedRowHash = removedHash && removedHash[row];
      addedRowHash = addedHash && addedHash[row];

      if (removedRowHash) {
        for (columnId in removedRowHash) {
          if (
            !addedRowHash ||
            removedRowHash[columnId] != addedRowHash[columnId]
          ) {
            node = this.getCellNode(row, this.getColumnIndex(columnId));
            if (node) {
              $(node).removeClass(removedRowHash[columnId]);
            }
          }
        }
      }

      if (addedRowHash) {
        for (columnId in addedRowHash) {
          if (
            !removedRowHash ||
            removedRowHash[columnId] != addedRowHash[columnId]
          ) {
            node = this.getCellNode(row, this.getColumnIndex(columnId));
            if (node) {
              $(node).addClass(addedRowHash[columnId]);
            }
          }
        }
      }
    }
  }

  ///
  addCellCssStyles(key, hash) {
    if (this.cellCssClasses[key]) {
      throw (
        "addCellCssStyles: cell CSS hash with key '" + key + "' already exists."
      );
    }

    this.cellCssClasses[key] = hash;
    this.updateCellCssStylesOnRenderedRows(hash, null);

    this.trigger(this.onCellCssStylesChanged, { key: key, hash: hash, grid: self });
  }

  ///
  removeCellCssStyles(key) {
    if (!this.cellCssClasses[key]) {
      return;
    }

    this.updateCellCssStylesOnRenderedRows(null, this.cellCssClasses[key]);
    delete this.cellCssClasses[key];

    this.trigger(this.onCellCssStylesChanged, { key: key, hash: null, grid: self });
  }

  ///
  setCellCssStyles(key, hash) {
    const prevHash = this.cellCssClasses[key];

    this.cellCssClasses[key] = hash;
    this.updateCellCssStylesOnRenderedRows(hash, prevHash);

    this.trigger(this.onCellCssStylesChanged, { key: key, hash: hash, grid: self });
  }

  ///
  getCellCssStyles(key) {
    return this.cellCssClasses[key];
  }

  ///
  flashCell(row, cell, speed) {
    speed = speed || 100;
    if (this.rowsCache[row]) {
      const $cell = $(this.getCellNode(row, cell));

      function toggleCellClass(times) {
        if (!times) {
          return;
        }
        setTimeout(() => {
          $cell.queue(() => {
            $cell.toggleClass(options.cellFlashingCssClass).dequeue();
            toggleCellClass(times - 1);
          });
        }, speed);
      }

      toggleCellClass(4);
    }
  }

  // ////////////////////////////////////////////////////////////////////////////////////////////
  // Interactivity

  ///
  private handleMouseWheel(e) {
    const rowNode = $(e.target).closest(".slick-row")[0];
    if (rowNode != this.rowNodeFromLastMouseWheelEvent) {
      if (
        this.zombieRowNodeFromLastMouseWheelEvent &&
        this.zombieRowNodeFromLastMouseWheelEvent != rowNode
      ) {
        if (
          this.options.enableAsyncPostRenderCleanup &&
          this.zombieRowPostProcessedFromLastMouseWheelEvent
        ) {
          this.queuePostProcessedRowForCleanup(
            this.zombieRowCacheFromLastMouseWheelEvent,
            this.zombieRowPostProcessedFromLastMouseWheelEvent
          );
        } else {
          this.$canvas[0].removeChild(this.zombieRowNodeFromLastMouseWheelEvent);
        }
        this.zombieRowNodeFromLastMouseWheelEvent = null;
        this.zombieRowCacheFromLastMouseWheelEvent = null;
        this.zombieRowPostProcessedFromLastMouseWheelEvent = null;

        if (this.options.enableAsyncPostRenderCleanup) {
          this.startPostProcessingCleanup();
        }
      }
      this.rowNodeFromLastMouseWheelEvent = rowNode;
    }
  }

  ///
  private handleDragStart(interactEvent) {
    const event = $.Event(
      interactEvent.originalEvent.type,
      interactEvent.originalEvent
    );
    const cell = this.getCellFromEvent(event);
    if (!cell || !this.cellExists(cell.row, cell.cell)) {
      return false;
    }

    const retval = this.trigger(this.onDragStart, interactEvent, event);
    if (event.isImmediatePropagationStopped()) {
      return retval;
    }

    return false;
  }

  ///
  private handleDrag(interactEvent) {
    const event = $.Event(
      interactEvent.originalEvent.type,
      interactEvent.originalEvent
    );
    return this.trigger(this.onDrag, interactEvent, event);
  }

  ///
  private handleDragEnd(interactEvent) {
    this.trigger(this.onDragEnd, interactEvent, $.Event("mousedown"));
  }

  ///
  private handleKeyDown(e) {
    this.trigger(
      this.onKeyDown,
      { row: this.activeRow, cell: this.activeCell, grid: self },
      e
    );
    let handled = e.isImmediatePropagationStopped();
    const keyCode = Slick.keyCode;

    if (!handled) {
      if (!e.shiftKey && !e.altKey && !e.ctrlKey) {
        // editor may specify an array of keys to bubble
        if (this.options.editable && this.currentEditor && this.currentEditor.keyCaptureList) {
          if (this.currentEditor.keyCaptureList.indexOf(e.which) > -1) {
            return;
          }
        }
        if (e.which == keyCode.ESCAPE) {
          if (!this.getEditorLock().isActive()) {
            return; // no editing mode to cancel, allow bubbling and default processing (exit without cancelling the event)
          }
          this.cancelEditAndSetFocus();
        } else if (e.which == keyCode.PAGE_DOWN) {
          this.navigatePageDown();
          handled = true;
        } else if (e.which == keyCode.PAGE_UP) {
          this.navigatePageUp();
          handled = true;
        } else if (e.which == keyCode.LEFT) {
          handled = this.navigateLeft();
        } else if (e.which == keyCode.RIGHT) {
          handled = this.navigateRight();
        } else if (e.which == keyCode.UP) {
          handled = this.navigateUp();
        } else if (e.which == keyCode.DOWN) {
          handled = this.navigateDown();
        } else if (e.which == keyCode.TAB) {
          handled = this.navigateNext();
        } else if (e.which == keyCode.ENTER) {
          if (this.options.editable) {
            if (this.currentEditor) {
              // adding new row
              if (this.activeRow === this.getDataLength()) {
                this.navigateDown();
              } else {
                this.commitEditAndSetFocus();
              }
            } else {
              if (this.getEditorLock().commitCurrentEdit()) {
                this.makeActiveCellEditable();
              }
            }
          }
          handled = true;
        }
      } else if (
        e.which == keyCode.TAB &&
        e.shiftKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        handled = this.navigatePrev();
      }
    }

    if (handled) {
      // the event has been handled so don't let parent element (bubbling/propagation) or browser (default) handle it
      e.stopPropagation();
      e.preventDefault();
      try {
        e.originalEvent.keyCode = 0; // prevent default behaviour for special keys in IE browsers (F3, F5, etc.)
      } catch (error) {
        // ignore exceptions - setting the original event's keycode throws access denied exception for "Ctrl"
        // (hitting control key only, nothing else), "Shift" (maybe others)
      }
    }
  }

  ///
  private handleClick(e) {
    if (!this.currentEditor) {
      // if this click resulted in some cell child node getting focus,
      // don't steal it back - keyboard events will still bubble up
      // IE9+ seems to default DIVs to tabIndex=0 instead of -1, so check for cell clicks directly.
      if (
        e.target != document.activeElement ||
        $(e.target).hasClass("slick-cell")
      ) {
        this.setFocus();
      }
    }

    const cell = this.getCellFromEvent(e);
    if (
      !cell ||
      (this.currentEditor !== null &&
        this.activeRow == cell.row &&
        this.activeCell == cell.cell)
    ) {
      return;
    }

    this.trigger(this.onClick, { row: cell.row, cell: cell.cell, grid: self }, e);
    if (e.isImmediatePropagationStopped()) {
      return;
    }

    if (
      (this.activeCell != cell.cell || this.activeRow != cell.row) &&
      this.canCellBeActive(cell.row, cell.cell)
    ) {
      if (!this.getEditorLock().isActive() || this.getEditorLock().commitCurrentEdit()) {
        this.scrollRowIntoView(cell.row, false);
        this.setActiveCellInternal(this.getCellNode(cell.row, cell.cell));
      }
    }
  }

  ///
  private handleContextMenu(e) {
    const $cell = $(e.target).closest(".slick-cell", this.$canvas);
    if ($cell.length === 0) {
      return;
    }

    // are we editing this cell?
    if (this.activeCellNode === $cell[0] && this.currentEditor !== null) {
      return;
    }

    this.trigger(this.onContextMenu, { grid: self }, e);
  }

  ///
  private handleDblClick(e) {
    const cell = this.getCellFromEvent(e);
    if (
      !cell ||
      (this.currentEditor !== null &&
        this.activeRow == cell.row &&
        this.activeCell == cell.cell)
    ) {
      return;
    }

    this.trigger(this.onDblClick, { row: cell.row, cell: cell.cell, grid: self }, e);
    if (e.isImmediatePropagationStopped()) {
      return;
    }

    if (this.options.editable) {
      this.gotoCell(cell.row, cell.cell, true);
    }
  }

  ///
  private handleHeaderMouseEnter(e) {
    this.trigger(
      this.onHeaderMouseEnter,
      {
        column: $(this).data("column"),
        grid: self,
      },
      e
    );
  }

  ///
  private handleHeaderMouseLeave(e) {
    this.trigger(
      this.onHeaderMouseLeave,
      {
        column: $(this).data("column"),
        grid: self,
      },
      e
    );
  }

  ///
  private handleHeaderContextMenu(e) {
    const $header = $(e.target).closest(
      ".slick-header-column",
      ".slick-header-columns"
    );
    const column = $header && $header.data("column");
    this.trigger(this.onHeaderContextMenu, { column: column, grid: self }, e);
  }

  ///
  private handleHeaderClick(e) {
    const $header = $(e.target).closest(
      ".slick-header-column",
      ".slick-header-columns"
    );
    const column = $header && $header.data("column");
    if (column) {
      this.trigger(this.onHeaderClick, { column: column, grid: self }, e);
    }
  }

  ///
  private handleMouseEnter(e) {
    this.trigger(this.onMouseEnter, { grid: self }, e);
  }

  ///
  private handleMouseLeave(e) {
    this.trigger(this.onMouseLeave, { grid: self }, e);
  }

  ///
  private cellExists(row, cell) {
    return !(
      row < 0 ||
      row >= this.getDataLength() ||
      cell < 0 ||
      cell >= this.columns.length
    );
  }

  ///
  getCellFromPoint(x, y) {
    const row = this.getRowFromPosition(y);
    let cell = 0;

    let w = 0;
    for (let i = 0; i < this.columns.length && w < x; i++) {
      w += this.columns[i].width;
      cell++;
    }

    if (cell < 0) {
      cell = 0;
    }

    return { row: row, cell: cell - 1 };
  }

  ///
  private getCellFromNode(cellNode) {
    // read column number from .l<columnNumber> CSS class
    const cls = /l\d+/.exec(cellNode.className);
    if (!cls) {
      throw "getCellFromNode: cannot get cell - " + cellNode.className;
    }
    return parseInt(cls[0].substr(1, cls[0].length - 1), 10);
  }

  ///
  private getRowFromNode(rowNode) {
    let row;
    for(row in this.rowsCache) {
      if (this.rowsCache[row].rowNode === rowNode) {
        return row | 0;
      }
    }

    return null;
  }

  ///
  getCellFromEvent(e) {
    const $cell = $(e.target).closest(".slick-cell", this.$canvas);
    if (!$cell.length) {
      return null;
    }

    const row = this.getRowFromNode($cell[0].parentNode);
    const cell = this.getCellFromNode($cell[0]);

    if (row == null || cell == null) {
      return null;
    } else {
      return {
        row: row,
        cell: cell,
      };
    }
  }

  ///
  getCellNodeBox(row, cell) {
    if (!this.cellExists(row, cell)) {
      return null;
    }

    const y1 = this.getRowTop(row);
    const y2 = y1 + this.options.rowHeight - 1;
    let x1 = 0;
    for (let i = 0; i < cell; i++) {
      x1 += this.columns[i].width;
    }
    const x2 = x1 + this.columns[cell].width;

    return {
      top: y1,
      left: x1,
      bottom: y2,
      right: x2,
    };
  }

  // ////////////////////////////////////////////////////////////////////////////////////////////
  // Cell switching

  ///
  resetActiveCell() {
    this.setActiveCellInternal(null, false);
  }

  ///
  setFocus() {
    if (this.tabbingDirection == -1) {
      this.$focusSink[0].focus();
    } else {
      this.$focusSink2[0].focus();
    }
  }

  ///
  scrollCellIntoView(row, cell, doPaging) {
    this.scrollRowIntoView(row, doPaging);

    const colspan = this.getColspan(row, cell);
    const left = this.columnPosLeft[cell];
    const right = this.columnPosRight[cell + (colspan > 1 ? colspan - 1 : 0)];
    const scrollRight = this.scrollLeft + this.viewportW;

    if (left < this.scrollLeft) {
      this.$viewport.scrollLeft(left);
      this.handleScroll();
      this.render();
    } else if (right > scrollRight) {
      this.$viewport.scrollLeft(Math.min(left, right - this.$viewport[0].clientWidth));
      this.handleScroll();
      this.render();
    }
  }

  ///
  private setActiveCellInternal(newCell, opt_editMode) {
    if (this.activeCellNode !== null) {
      this.makeActiveCellNormal();
      $(this.activeCellNode).removeClass("active");
      if (this.rowsCache[this.activeRow]) {
        $(this.rowsCache[this.activeRow].rowNode).removeClass("active");
      }
    }

    const activeCellChanged = this.activeCellNode !== newCell;
    this.activeCellNode = newCell;

    if (this.activeCellNode != null) {
      this.activeRow = this.getRowFromNode(this.activeCellNode.parentNode);
      this.activeCell = this.activePosX = this.getCellFromNode(this.activeCellNode);

      if (opt_editMode == null) {
        opt_editMode = this.activeRow == this.getDataLength() || this.options.autoEdit;
      }

      $(this.activeCellNode).addClass("active");
      $(this.rowsCache[this.activeRow].rowNode).addClass("active");

      if (
        this.options.editable &&
        opt_editMode &&
        this.isCellPotentiallyEditable(this.activeRow, this.activeCell)
      ) {
        clearTimeout(this.h_editorLoader);

        if (this.options.asyncEditorLoading) {
          this.h_editorLoader = setTimeout(() => {
            this.makeActiveCellEditable();
          }, this.options.asyncEditorLoadDelay);
        } else {
          this.makeActiveCellEditable();
        }
      }
    } else {
      this.activeRow = this.activeCell = null;
    }

    if (activeCellChanged) {
      this.trigger(this.onActiveCellChanged, this.getActiveCell());
    }
  }

  ///
  private clearTextSelection() {
    if (document.selection && document.selection.empty) {
      try {
        // IE fails here if selected element is not in dom
        document.selection.empty();
      } catch (e) {}
    } else if (window.getSelection) {
      const sel = window.getSelection();
      if (sel && sel.removeAllRanges) {
        sel.removeAllRanges();
      }
    }
  }

  ///
  private isCellPotentiallyEditable(row, cell) {
    const dataLength = this.getDataLength();
    // is the data for this row loaded?
    if (row < dataLength && !this.getDataItem(row)) {
      return false;
    }

    // are we in the Add New row?  can we create new from this cell?
    if (this.columns[cell].cannotTriggerInsert && row >= dataLength) {
      return false;
    }

    // does this cell have an editor?
    if (!this.getEditor(row, cell)) {
      return false;
    }

    return true;
  }

  ///
  private makeActiveCellNormal() {
    if (!this.currentEditor) {
      return;
    }
    this.trigger(this.onBeforeCellEditorDestroy, {
      editor: this.currentEditor,
      grid: self,
    });
    this.currentEditor.destroy();
    this.currentEditor = null;

    if (this.activeCellNode) {
      const d = this.getDataItem(this.activeRow);
      $(this.activeCellNode).removeClass("editable invalid");
      if (d) {
        const column = this.columns[this.activeCell];
        const formatter = this.getFormatter(this.activeRow, column);
        this.activeCellNode.innerHTML = formatter(
          this.activeRow,
          this.activeCell,
          this.getDataItemValueForColumn(d, column),
          column,
          d,
          self
        );
        this.invalidatePostProcessingResults(this.activeRow);
      }
    }

    // if there previously was text selected on a page (such as selected text in the edit cell just removed),
    // IE can't set focus to anything else correctly
    if (navigator.userAgent.toLowerCase().match(/msie/)) {
      this.clearTextSelection();
    }

    this.getEditorLock().deactivate(this.editController);
  }

  ///
  makeActiveCellEditable(editor) {
    if (!this.activeCellNode) {
      return;
    }
    if (!this.options.editable) {
      throw "Grid : makeActiveCellEditable : should never get called when options.editable is false";
    }

    // cancel pending async call if there is one
    clearTimeout(this.h_editorLoader);

    if (!this.isCellPotentiallyEditable(this.activeRow, this.activeCell)) {
      return;
    }

    const columnDef = this.columns[this.activeCell];
    const item = this.getDataItem(this.activeRow);

    if (
      this.trigger(this.onBeforeEditCell, {
        row: this.activeRow,
        cell: this.activeCell,
        item: item,
        column: columnDef,
        grid: self,
      }) === false
    ) {
      this.setFocus();
      return;
    }

    this.getEditorLock().activate(this.editController);
    $(this.activeCellNode).addClass("editable");

    const useEditor = editor || this.getEditor(this.activeRow, this.activeCell);

    // don't clear the cell if a custom editor is passed through
    if (!editor && !useEditor.suppressClearOnEdit) {
      this.activeCellNode.innerHTML = "";
    }

    this.currentEditor = new useEditor({
      grid: self,
      gridPosition: this.absBox(this.$container[0]),
      position: this.absBox(this.activeCellNode),
      container: this.activeCellNode,
      column: columnDef,
      item: item || {},
      commitChanges: this.commitEditAndSetFocus,
      cancelChanges: this.cancelEditAndSetFocus,
    });

    if (item) {
      this.currentEditor.loadValue(item);
    }

    this.serializedEditorValue = this.currentEditor.serializeValue();

    if (this.currentEditor.position) {
      this.handleActiveCellPositionChange();
    }
  }

  ///
  private commitEditAndSetFocus() {
    // if the commit fails, it would do so due to a validation error
    // if so, do not steal the focus from the editor
    if (this.getEditorLock().commitCurrentEdit()) {
      this.setFocus();
      if (this.options.autoEdit) {
        this.navigateDown();
      }
    }
  }

  ///
  private cancelEditAndSetFocus() {
    if (this.getEditorLock().cancelCurrentEdit()) {
      this.setFocus();
    }
  }

  ///
  private absBox(elem) {
    const box = {
      top: elem.offsetTop,
      left: elem.offsetLeft,
      bottom: 0,
      right: 0,
      width: $(elem).outerWidth(),
      height: $(elem).outerHeight(),
      visible: true,
    };
    box.bottom = box.top + box.height;
    box.right = box.left + box.width;

    // walk up the tree
    let offsetParent = elem.offsetParent;
    while ((elem = elem.parentNode) != document.body) {
      if (elem == null) break;

      if (
        box.visible &&
        elem.scrollHeight != elem.offsetHeight &&
        $(elem).css("overflowY") != "visible"
      ) {
        box.visible =
          box.bottom > elem.scrollTop &&
          box.top < elem.scrollTop + elem.clientHeight;
      }

      if (
        box.visible &&
        elem.scrollWidth != elem.offsetWidth &&
        $(elem).css("overflowX") != "visible"
      ) {
        box.visible =
          box.right > elem.scrollLeft &&
          box.left < elem.scrollLeft + elem.clientWidth;
      }

      box.left -= elem.scrollLeft;
      box.top -= elem.scrollTop;

      if (elem === offsetParent) {
        box.left += elem.offsetLeft;
        box.top += elem.offsetTop;
        offsetParent = elem.offsetParent;
      }

      box.bottom = box.top + box.height;
      box.right = box.left + box.width;
    }

    return box;
  }

  ///
  getActiveCellPosition() {
    return this.absBox(this.activeCellNode);
  }

  ///
  getGridPosition() {
    return this.absBox(this.$container[0]);
  }

  ///
  private handleActiveCellPositionChange() {
    if (!this.activeCellNode) {
      return;
    }

    this.trigger(this.onActiveCellPositionChanged, { grid: self });

    if (this.currentEditor) {
      const cellBox = this.getActiveCellPosition();
      if (this.currentEditor.show && this.currentEditor.hide) {
        if (!cellBox.visible) {
          this.currentEditor.hide();
        } else {
          this.currentEditor.show();
        }
      }

      if (this.currentEditor.position) {
        this.currentEditor.position(cellBox);
      }
    }
  }

  ///
  getCellEditor() {
    return this.currentEditor;
  }

  ///
  getActiveCell() {
    if (!this.activeCellNode) {
      return null;
    } else {
      return { row: this.activeRow, cell: this.activeCell, grid: self };
    }
  }

  ///
  getActiveCellNode() {
    return this.activeCellNode;
  }

  ///
  scrollRowIntoView(row, doPaging) {
    const rowAtTop = row * this.options.rowHeight;
    const rowAtBottom =
      (row + 1) * this.options.rowHeight -
      this.viewportH +
      (this.viewportHasHScroll ? scrollbarDimensions.height : 0);

    // need to page down?
    if ((row + 1) * this.options.rowHeight > this.scrollTop + this.viewportH + this.offset) {
      this.scrollTo(doPaging ? rowAtTop : rowAtBottom);
      this.render();
    }
    // or page up?
    else if (row * this.options.rowHeight < this.scrollTop + this.offset) {
      this.scrollTo(doPaging ? rowAtBottom : rowAtTop);
      this.render();
    }
  }

  ///
  scrollRowToTop(row) {
    this.scrollTo(row * this.options.rowHeight);
    this.render();
  }

  ///
  private scrollPage(dir) {
    const deltaRows = dir * this.numVisibleRows;
    this.scrollTo((this.getRowFromPosition(this.scrollTop) + deltaRows) * this.options.rowHeight);
    this.render();

    if (this.options.enableCellNavigation && this.activeRow != null) {
      let row = this.activeRow + deltaRows;
      const dataLengthIncludingAddNew = this.getDataLengthIncludingAddNew();
      if (row >= dataLengthIncludingAddNew) {
        row = dataLengthIncludingAddNew - 1;
      }
      if (row < 0) {
        row = 0;
      }

      let cell = 0;
      let prevCell = null;
      const prevActivePosX = this.activePosX;
      while (cell <= this.activePosX) {
        if (this.canCellBeActive(row, cell)) {
          prevCell = cell;
        }
        cell += this.getColspan(row, cell);
      }

      if (prevCell !== null) {
        this.setActiveCellInternal(this.getCellNode(row, prevCell));
        this.activePosX = prevActivePosX;
      } else {
        this.resetActiveCell();
      }
    }
  }

  ///
  navigatePageDown() {
    this.scrollPage(1);
  }

  ///
  navigatePageUp() {
    this.scrollPage(-1);
  }

  ///
  private getColspan(row, cell) {
    const metadata = this.data.getItemMetadata && this.data.getItemMetadata(row);
    if (!metadata || !metadata.columns) {
      return 1;
    }

    const columnData =
      metadata.columns[this.columns[cell].id] || metadata.columns[cell];
    let colspan = columnData && columnData.colspan;
    if (colspan === "*") {
      colspan = this.columns.length - cell;
    } else {
      colspan = colspan || 1;
    }

    return colspan;
  }

  ///
  private findFirstFocusableCell(row) {
    let cell = 0;
    while (cell < this.columns.length) {
      if (this.canCellBeActive(row, cell)) {
        return cell;
      }
      cell += this.getColspan(row, cell);
    }
    return null;
  }

  ///
  private findLastFocusableCell(row) {
    let cell = 0;
    let lastFocusableCell = null;
    while (cell < this.columns.length) {
      if (this.canCellBeActive(row, cell)) {
        lastFocusableCell = cell;
      }
      cell += this.getColspan(row, cell);
    }
    return lastFocusableCell;
  }

  ///
  private gotoRight(row, cell, posX) {
    if (cell >= this.columns.length) {
      return null;
    }

    do {
      cell += this.getColspan(row, cell);
    } while (cell < this.columns.length && !this.canCellBeActive(row, cell));

    if (cell < this.columns.length) {
      return {
        row: row,
        cell: cell,
        posX: cell,
      };
    }
    return null;
  }

  ///
  private gotoLeft(row, cell, posX) {
    if (cell <= 0) {
      return null;
    }

    const firstFocusableCell = this.findFirstFocusableCell(row);
    if (firstFocusableCell === null || firstFocusableCell >= cell) {
      return null;
    }

    let prev = {
      row: row,
      cell: firstFocusableCell,
      posX: firstFocusableCell,
    };
    let pos;
    while (true) {
      pos = this.gotoRight(prev.row, prev.cell, prev.posX);
      if (!pos) {
        return null;
      }
      if (pos.cell >= cell) {
        return prev;
      }
      prev = pos;
    }
  }

  ///
  private gotoDown(row, cell, posX) {
    let prevCell;
    const dataLengthIncludingAddNew = this.getDataLengthIncludingAddNew();
    while (true) {
      if (++row >= dataLengthIncludingAddNew) {
        return null;
      }

      prevCell = cell = 0;
      while (cell <= posX) {
        prevCell = cell;
        cell += this.getColspan(row, cell);
      }

      if (this.canCellBeActive(row, prevCell)) {
        return {
          row: row,
          cell: prevCell,
          posX: posX,
        };
      }
    }
  }

  ///
  private gotoUp(row, cell, posX) {
    let prevCell;
    while (true) {
      if (--row < 0) {
        return null;
      }

      prevCell = cell = 0;
      while (cell <= posX) {
        prevCell = cell;
        cell += this.getColspan(row, cell);
      }

      if (this.canCellBeActive(row, prevCell)) {
        return {
          row: row,
          cell: prevCell,
          posX: posX,
        };
      }
    }
  }

  ///
  private gotoNext(row, cell, posX) {
    if (row == null && cell == null) {
      row = cell = posX = 0;
      if (this.canCellBeActive(row, cell)) {
        return {
          row: row,
          cell: cell,
          posX: cell,
        };
      }
    }

    const pos = this.gotoRight(row, cell, posX);
    if (pos) {
      return pos;
    }

    let firstFocusableCell = null;
    const dataLengthIncludingAddNew = this.getDataLengthIncludingAddNew();
    while (++row < dataLengthIncludingAddNew) {
      firstFocusableCell = this.findFirstFocusableCell(row);
      if (firstFocusableCell !== null) {
        return {
          row: row,
          cell: firstFocusableCell,
          posX: firstFocusableCell,
        };
      }
    }
    return null;
  }

  ///
  private gotoPrev(row, cell, posX) {
    if (row == null && cell == null) {
      row = this.getDataLengthIncludingAddNew() - 1;
      cell = posX = this.columns.length - 1;
      if (this.canCellBeActive(row, cell)) {
        return {
          row: row,
          cell: cell,
          posX: cell,
        };
      }
    }

    let pos;
    let lastSelectableCell;
    while (!pos) {
      pos = this.gotoLeft(row, cell, posX);
      if (pos) {
        break;
      }
      if (--row < 0) {
        return null;
      }

      cell = 0;
      lastSelectableCell = this.findLastFocusableCell(row);
      if (lastSelectableCell !== null) {
        pos = {
          row: row,
          cell: lastSelectableCell,
          posX: lastSelectableCell,
        };
      }
    }
    return pos;
  }

  ///
  navigateRight() {
    return this.navigate("right");
  }

  ///
  navigateLeft() {
    return this.navigate("left");
  }

  ///
  navigateDown() {
    return this.navigate("down");
  }

  ///
  navigateUp() {
    return this.navigate("up");
  }

  ///
  navigateNext() {
    return this.navigate("next");
  }

  ///
  navigatePrev() {
    return this.navigate("prev");
  }

  /**
   * @param {string} dir Navigation direction.
   * @return {boolean} Whether navigation resulted in a change of active cell.
   */
  ///
  private navigate(dir) {
    if (!this.options.enableCellNavigation) {
      return false;
    }

    if (!this.activeCellNode && dir != "prev" && dir != "next") {
      return false;
    }

    if (!this.getEditorLock().commitCurrentEdit()) {
      return true;
    }
    this.setFocus();

    const tabbingDirections = {
      up: -1,
      down: 1,
      left: -1,
      right: 1,
      prev: -1,
      next: 1,
    };
    this.tabbingDirection = tabbingDirections[dir];

    const stepFunctions = {
      up: this.gotoUp,
      down: this.gotoDown,
      left: this.gotoLeft,
      right: this.gotoRight,
      prev: this.gotoPrev,
      next: this.gotoNext,
    };
    const stepFn = stepFunctions[dir];
    const pos = stepFn(this.activeRow, this.activeCell, this.activePosX);
    if (pos) {
      const isAddNewRow = pos.row == this.getDataLength();
      this.scrollCellIntoView(pos.row, pos.cell, !isAddNewRow);
      this.setActiveCellInternal(this.getCellNode(pos.row, pos.cell));
      this.activePosX = pos.posX;
      return true;
    } else {
      this.setActiveCellInternal(this.getCellNode(this.activeRow, this.activeCell));
      return false;
    }
  }

  ///
  getCellNode(row, cell) {
    if (this.rowsCache[row]) {
      this.ensureCellNodesInRowsCache(row);
      return this.rowsCache[row].cellNodesByColumnIdx[cell];
    }
    return null;
  }

  ///
  setActiveCell(row, cell) {
    if (!this.initialized) {
      return;
    }
    if (
      row > this.getDataLength() ||
      row < 0 ||
      cell >= this.columns.length ||
      cell < 0
    ) {
      return;
    }

    if (!this.options.enableCellNavigation) {
      return;
    }

    this.scrollCellIntoView(row, cell, false);
    this.setActiveCellInternal(this.getCellNode(row, cell), false);
  }

  ///
  canCellBeActive(row, cell) {
    if (
      !this.options.enableCellNavigation ||
      row >= this.getDataLengthIncludingAddNew() ||
      row < 0 ||
      cell >= this.columns.length ||
      cell < 0
    ) {
      return false;
    }

    const rowMetadata = this.data.getItemMetadata && this.data.getItemMetadata(row);
    if (rowMetadata && typeof rowMetadata.focusable === "boolean") {
      return rowMetadata.focusable;
    }

    const columnMetadata = rowMetadata && rowMetadata.columns;
    if (
      columnMetadata &&
      columnMetadata[this.columns[cell].id] &&
      typeof columnMetadata[this.columns[cell].id].focusable === "boolean"
    ) {
      return columnMetadata[this.columns[cell].id].focusable;
    }
    if (
      columnMetadata &&
      columnMetadata[cell] &&
      typeof columnMetadata[cell].focusable === "boolean"
    ) {
      return columnMetadata[cell].focusable;
    }

    return this.columns[cell].focusable;
  }

  ///
  canCellBeSelected(row, cell) {
    if (
      row >= this.getDataLength() ||
      row < 0 ||
      cell >= this.columns.length ||
      cell < 0
    ) {
      return false;
    }

    const rowMetadata = this.data.getItemMetadata && this.data.getItemMetadata(row);
    if (rowMetadata && typeof rowMetadata.selectable === "boolean") {
      return rowMetadata.selectable;
    }

    const columnMetadata =
      rowMetadata &&
      rowMetadata.columns &&
      (rowMetadata.columns[this.columns[cell].id] || rowMetadata.columns[cell]);
    if (columnMetadata && typeof columnMetadata.selectable === "boolean") {
      return columnMetadata.selectable;
    }

    return this.columns[cell].selectable;
  }

  ///
  gotoCell(row, cell, forceEdit) {
    if (!this.initialized) {
      return;
    }
    if (!this.canCellBeActive(row, cell)) {
      return;
    }

    if (!this.getEditorLock().commitCurrentEdit()) {
      return;
    }

    this.scrollCellIntoView(row, cell, false);

    const newCell = this.getCellNode(row, cell);

    // if selecting the 'add new' row, start editing right away
    this.setActiveCellInternal(
      newCell,
      forceEdit || row === this.getDataLength() || this.options.autoEdit
    );

    // if no editor was created, set the focus back on the grid
    if (!this.currentEditor) {
      this.setFocus();
    }
  }

  // ////////////////////////////////////////////////////////////////////////////////////////////
  // IEditor implementation for the editor lock

  ///
  private commitCurrentEdit() {
    const item = this.getDataItem(this.activeRow);
    const column = this.columns[this.activeCell];

    if (this.currentEditor) {
      if (this.currentEditor.isValueChanged()) {
        const validationResults = this.currentEditor.validate();

        if (validationResults.valid) {
          if (this.activeRow < this.getDataLength()) {
            const editCommand = {
              row: this.activeRow,
              cell: this.activeCell,
              editor: this.currentEditor,
              serializedValue: this.currentEditor.serializeValue(),
              prevSerializedValue: this.serializedEditorValue,
              execute() {
                this.editor.applyValue(item, this.serializedValue);
                updateRow(this.row);
                trigger(this.onCellChange, {
                  row: activeRow,
                  cell: activeCell,
                  item: item,
                  grid: self,
                });
              },
              undo() {
                this.editor.applyValue(item, this.prevSerializedValue);
                updateRow(this.row);
                trigger(this.onCellChange, {
                  row: activeRow,
                  cell: activeCell,
                  item: item,
                  grid: self,
                });
              },
            };

            if (this.options.editCommandHandler) {
              this.makeActiveCellNormal();
              this.options.editCommandHandler(item, column, editCommand);
            } else {
              editCommand.execute();
              this.makeActiveCellNormal();
            }
          } else {
            const newItem = {};
            this.currentEditor.applyValue(newItem, this.currentEditor.serializeValue());
            this.makeActiveCellNormal();
            this.trigger(this.onAddNewRow, {
              item: newItem,
              column: column,
              grid: self,
            });
          }

          // check whether the lock has been re-acquired by event handlers
          return !this.getEditorLock().isActive();
        } else {
          // Re-add the CSS class to trigger transitions, if any.
          $(this.activeCellNode).removeClass("invalid");
          $(this.activeCellNode).width()!; // force layout
          $(this.activeCellNode).addClass("invalid");

          this.trigger(this.onValidationError, {
            editor: this.currentEditor,
            cellNode: this.activeCellNode,
            validationResults: validationResults,
            row: this.activeRow,
            cell: this.activeCell,
            column: column,
            grid: self,
          });

          this.currentEditor.focus();
          return false;
        }
      }

      this.makeActiveCellNormal();
    }
    return true;
  }

  ///
  private cancelCurrentEdit() {
    this.makeActiveCellNormal();
    return true;
  }

  ///
  private rowsToRanges(rows) {
    const ranges  = [] as any[];
    const lastCell = this.columns.length - 1;
    for (let i = 0; i < rows.length; i++) {
      ranges.push(new Slick.Range(rows[i], 0, rows[i], lastCell));
    }
    return ranges;
  }

  ///
  getSelectedRows() {
    if (!this.selectionModel) {
      throw "Selection model is not set";
    }
    return this.selectedRows;
  }

  ///
  setSelectedRows(rows) {
    if (!this.selectionModel) {
      throw "Selection model is not set";
    }
    this.selectionModel.setSelectedRanges(this.rowsToRanges(rows));
  }

  // ////////////////////////////////////////////////////////////////////////////////////////////
  // Debug

  private debug = () => {
    let s = "";

    s += "\n" + "counter_rows_rendered:  " + this.counter_rows_rendered;
    s += "\n" + "counter_rows_removed:  " + this.counter_rows_removed;
    s += "\n" + "renderedRows:  " + this.renderedRows;
    s += "\n" + "numVisibleRows:  " + this.numVisibleRows;
    s += "\n" + "maxSupportedCssHeight:  " + maxSupportedCssHeight;
    s += "\n" + "n(umber of pages):  " + this.n;
    s += "\n" + "(current) page:  " + this.page;
    s += "\n" + "page height (ph):  " + this.ph;
    s += "\n" + "vScrollDir:  " + this.vScrollDir;

    alert(s);
  };

  // a debug helper to be able to access private members
  private eval = expr => eval(expr);

  // ////////////////////////////////////////////////////////////////////////////////////////////
  onScroll = new Slick.Event();
  onSort = new Slick.Event();
  onHeaderMouseEnter = new Slick.Event();
  onHeaderMouseLeave = new Slick.Event();
  onHeaderContextMenu = new Slick.Event();
  onHeaderClick = new Slick.Event();
  onHeaderCellRendered = new Slick.Event();
  onBeforeHeaderCellDestroy = new Slick.Event();
  onHeaderRowCellRendered = new Slick.Event();
  onFooterRowCellRendered = new Slick.Event();
  onBeforeHeaderRowCellDestroy = new Slick.Event();
  onBeforeFooterRowCellDestroy = new Slick.Event();
  onMouseEnter = new Slick.Event();
  onMouseLeave = new Slick.Event();
  onClick = new Slick.Event();
  onDblClick = new Slick.Event();
  onContextMenu = new Slick.Event();
  onKeyDown = new Slick.Event();
  onAddNewRow = new Slick.Event();
  onValidationError = new Slick.Event();
  onViewportChanged = new Slick.Event();
  onColumnsReordered = new Slick.Event();
  onColumnsResized = new Slick.Event();
  onCellChange = new Slick.Event();
  onBeforeEditCell = new Slick.Event();
  onBeforeCellEditorDestroy = new Slick.Event();
  onBeforeDestroy = new Slick.Event();
  onActiveCellChanged = new Slick.Event();
  onActiveCellPositionChanged = new Slick.Event();
  onDragInit = new Slick.Event();
  onDragStart = new Slick.Event();
  onDrag = new Slick.Event();
  onDragEnd = new Slick.Event();
  onSelectedRowsChanged = new Slick.Event();
  onCellCssStylesChanged = new Slick.Event();
}
