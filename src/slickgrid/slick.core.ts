/* eslint-disable no-prototype-builtins */
import SlickGrid from "./slick.grid";

/***
 * An event object for passing data to event handlers and letting them control propagation.
 * <p>This is pretty much identical to how W3C and jQuery implement events.</p>
 * @class EventData
 * @constructor
 */
class EventData {
  private _isPropagationStopped = false;
  private _isImmediatePropagationStopped = false;

  /***
   * Stops event from propagating up the DOM tree.
   * @method stopPropagation
   */
  stopPropagation() {
    this._isPropagationStopped = true;
  }

  /***
   * Returns whether stopPropagation was called on this event object.
   * @method isPropagationStopped
   * @return {Boolean}
   */
  isPropagationStopped() {
    return this._isPropagationStopped;
  }

  /***
   * Prevents the rest of the handlers from being executed.
   * @method stopImmediatePropagation
   */
  stopImmediatePropagation() {
    this._isImmediatePropagationStopped = true;
  }

  /***
   * Returns whether stopImmediatePropagation was called on this event object.\
   * @method isImmediatePropagationStopped
   * @return {Boolean}
   */
  isImmediatePropagationStopped() {
    return this._isImmediatePropagationStopped;
  }
}

/***
 * A simple publisher-subscriber implementation.
 * @class Event
 * @constructor
 */
class Event {
  private handlers = [] as any[];

  /***
   * Adds an event handler to be called when the event is fired.
   * <p>Event handler will receive two arguments - an <code>EventData</code> and the <code>data</code>
   * object the event was fired with.<p>
   * @method subscribe
   * @param fn {Function} Event handler.
   */
  subscribe(fn) {
    this.handlers.push(fn);
  }

  /***
   * Removes an event handler added with <code>subscribe(fn)</code>.
   * @method unsubscribe
   * @param fn {Function} Event handler to be removed.
   */
  unsubscribe(fn) {
    for (let i = this.handlers.length - 1; i >= 0; i--) {
      if (this.handlers[i] === fn) {
        this.handlers.splice(i, 1);
      }
    }
  }

  /***
   * Fires an event notifying all subscribers.
   * @method notify
   * @param args {Object} Additional data object to be passed to all handlers.
   * @param e {EventData}
   *      Optional.
   *      An <code>EventData</code> object to be passed to all handlers.
   *      For DOM events, an existing W3C/jQuery event object can be passed in.
   * @param scope {Object}
   *      Optional.
   *      The scope ("this") within which the handler will be executed.
   *      If not specified, the scope will be set to the <code>Event</code> instance.
   */
  notify(args, e, scope) {
    e = e || new EventData();
    scope = scope || this;

    let returnValue;
    for (
      let i = 0;
      i < this.handlers.length &&
      !(e.isPropagationStopped() || e.isImmediatePropagationStopped());
      i++
    ) {
      returnValue = this.handlers[i].call(scope, e, args);
    }

    return returnValue;
  }
}

class EventHandler {
  private handlers = [] as any[];

  subscribe(event, handler) {
    this.handlers.push({
      event: event,
      handler: handler,
    });
    event.subscribe(handler);

    return this; // allow chaining
  }

  unsubscribe(event, handler) {
    let i = this.handlers.length;
    while (i--) {
      if (
        this.handlers[i].event === event &&
        this.handlers[i].handler === handler
      ) {
        this.handlers.splice(i, 1);
        event.unsubscribe(handler);
        return;
      }
    }

    return this; // allow chaining
  }

  unsubscribeAll() {
    let i = this.handlers.length;
    while (i--) {
      this.handlers[i].event.unsubscribe(this.handlers[i].handler);
    }
    this.handlers = [];

    return this; // allow chaining
  }
}

/***
 * A structure containing a range of cells.
 * @class Range
 * @constructor
 * @param fromRow {Integer} Starting row.
 * @param fromCell {Integer} Starting cell.
 * @param toRow {Integer} Optional. Ending row. Defaults to <code>fromRow</code>.
 * @param toCell {Integer} Optional. Ending cell. Defaults to <code>fromCell</code>.
 */
class Range {
  private fromRow: number;
  private toRow: number;
  private fromCell: number;
  private toCell: number;

  constructor(fromRow, fromCell, toRow, toCell) {
    this.fromRow = fromRow;
    this.toRow = toRow;
    this.fromCell = fromCell;
    this.toCell = toCell;

    if (toRow === undefined && toCell === undefined) {
      this.toRow = fromRow;
      this.toCell = fromCell;
    }

    this.fromRow = Math.min(fromRow, toRow);
    this.fromCell = Math.min(fromCell, toCell);
    this.toRow = Math.max(fromRow, toRow);
    this.toCell = Math.max(fromCell, toCell);
  }

  isSingleRow() {
    return this.fromRow == this.toRow;
  }

  /***
   * Returns whether a range represents a single cell.
   * @method isSingleCell
   * @return {Boolean}
   */
  isSingleCell() {
    return this.fromRow == this.toRow && this.fromCell == this.toCell;
  }

  /***
   * Returns whether a range contains a given cell.
   * @method contains
   * @param row {Integer}
   * @param cell {Integer}
   * @return {Boolean}
   */
  contains(row, cell) {
    return (
      row >= this.fromRow &&
      row <= this.toRow &&
      cell >= this.fromCell &&
      cell <= this.toCell
    );
  }

  /***
   * Returns a readable representation of a range.
   * @method toString
   * @return {String}
   */
  toString() {
    if (this.isSingleCell()) {
      return "(" + this.fromRow + ":" + this.fromCell + ")";
    } else {
      return (
        "(" +
        this.fromRow +
        ":" +
        this.fromCell +
        " - " +
        this.toRow +
        ":" +
        this.toCell +
        ")"
      );
    }
  }
}

/***
 * A base class that all special / non-data rows (like Group and GroupTotals) derive from.
 * @class NonDataItem
 * @constructor
 */
class NonDataItem {
  private __nonDataRow = true;
}

/***
 * Information about a group of rows.
 * @class Group
 * @extends Slick.NonDataItem
 * @constructor
 */
class Group extends NonDataItem {
  private __group = true;

  /**
   * Grouping level, starting with 0.
   * @property level
   * @type {Number}
   */
  private level = 0;

  /***
   * Number of rows in the group.
   * @property count
   * @type {Integer}
   */
  private count = 0;

  /***
   * Grouping value.
   * @property value
   * @type {Object}
   */
  private value = null as any;

  /***
   * Formatted display value of the group.
   * @property title
   * @type {String}
   */
  private title = null as string | null;

  /***
   * Whether a group is collapsed.
   * @property collapsed
   * @type {Boolean}
   */
  private collapsed = false as boolean;

  /***
   * GroupTotals, if any.
   * @property totals
   * @type {GroupTotals}
   */
  private totals = null as GroupTotals | null;

  /**
   * Rows that are part of the group.
   * @property rows
   * @type {Array}
   */
  private rows = [] as any[];

  /**
   * Sub-groups that are part of the group.
   * @property groups
   * @type {Array}
   */
  private groups = null as any[] | null;

  /**
   * A unique key used to identify the group.  This key can be used in calls to DataView
   * collapseGroup() or expandGroup().
   * @property groupingKey
   * @type {Object}
   */
  private groupingKey = null as any;

  /***
   * Compares two Group instances.
   * @method equals
   * @return {Boolean}
   * @param group {Group} Group instance to compare to.
   */
  equals(group) {
    return (
      this.value === group.value &&
      this.count === group.count &&
      this.collapsed === group.collapsed &&
      this.title === group.title
    );
  }
}

/***
 * Information about group totals.
 * An instance of GroupTotals will be created for each totals row and passed to the aggregators
 * so that they can store arbitrary data in it.  That data can later be accessed by group totals
 * formatters during the display.
 * @class GroupTotals
 * @extends Slick.NonDataItem
 * @constructor
 */
class GroupTotals extends NonDataItem {
  private __groupTotals = true as boolean;

  /***
   * Parent Group.
   * @param group
   * @type {Group}
   */
  group = null as Group | null;

  /***
   * Whether the totals have been fully initialized / calculated.
   * Will be set to false for lazy-calculated group totals.
   * @param initialized
   * @type {Boolean}
   */
  initialized = false as boolean;
}

interface EditController {
  commitCurrentEdit(): boolean;
  cancelCurrentEdit(): boolean;
}

/***
 * A locking helper to track the active edit controller and ensure that only a single controller
 * can be active at a time.  This prevents a whole class of state and validation synchronization
 * issues.  An edit controller (such as SlickGrid) can query if an active edit is in progress
 * and attempt a commit or cancel before proceeding.
 * @class EditorLock
 * @constructor
 */
class EditorLock {
  private activeEditController = null as EditController | null;

  /***
   * Returns true if a specified edit controller is active (has the edit lock).
   * If the parameter is not specified, returns true if any edit controller is active.
   * @method isActive
   * @param editController {EditController}
   * @return {Boolean}
   */
  isActive(editController) {
    return editController
      ? this.activeEditController === editController
      : this.activeEditController !== null;
  }

  /***
   * Sets the specified edit controller as the active edit controller (acquire edit lock).
   * If another edit controller is already active, and exception will be thrown.
   * @method activate
   * @param editController {EditController} edit controller acquiring the lock
   */
  activate(editController) {
    if (editController === this.activeEditController) {
      // already activated?
      return;
    }
    if (this.activeEditController !== null) {
      throw "SlickGrid.EditorLock.activate: an editController is still active, can't activate another editController";
    }
    if (!editController.commitCurrentEdit) {
      throw "SlickGrid.EditorLock.activate: editController must implement .commitCurrentEdit()";
    }
    if (!editController.cancelCurrentEdit) {
      throw "SlickGrid.EditorLock.activate: editController must implement .cancelCurrentEdit()";
    }
    this.activeEditController = editController;
  }

  /***
   * Unsets the specified edit controller as the active edit controller (release edit lock).
   * If the specified edit controller is not the active one, an exception will be thrown.
   * @method deactivate
   * @param editController {EditController} edit controller releasing the lock
   */
  deactivate(editController) {
    if (this.activeEditController !== editController) {
      throw "SlickGrid.EditorLock.deactivate: specified editController is not the currently active one";
    }
    this.activeEditController = null;
  }

  /***
   * Attempts to commit the current edit by calling "commitCurrentEdit" method on the active edit
   * controller and returns whether the commit attempt was successful (commit may fail due to validation
   * errors, etc.).  Edit controller's "commitCurrentEdit" must return true if the commit has succeeded
   * and false otherwise.  If no edit controller is active, returns true.
   * @method commitCurrentEdit
   * @return {Boolean}
   */
  commitCurrentEdit() {
    return this.activeEditController
      ? this.activeEditController!.commitCurrentEdit()
      : true;
  }

  /***
   * Attempts to cancel the current edit by calling "cancelCurrentEdit" method on the active edit
   * controller and returns whether the edit was successfully cancelled.  If no edit controller is
   * active, returns true.
   * @method cancelCurrentEdit
   * @return {Boolean}
   */
  cancelCurrentEditcancelCurrentEdit() {
    if (this.activeEditController) {
      return this.activeEditController.cancelCurrentEdit();
    }
    return true;
  }
}

/**
 *
 * @param {Array} treeColumns Array com levels of columns
 * @returns {{hasDepth: 'hasDepth', getTreeColumns: 'getTreeColumns', extractColumns: 'extractColumns', getDepth: 'getDepth', getColumnsInDepth: 'getColumnsInDepth', getColumnsInGroup: 'getColumnsInGroup', visibleColumns: 'visibleColumns', filter: 'filter', reOrder: reOrder}}
 * @constructor
 */
class TreeColumns {
  private treeColumns;

  constructor(treeColumns) {
    this.treeColumns = treeColumns;
    this.mapToId(treeColumns);
  }

  private columnsById = {};

  mapToId(columns) {
    columns.forEach((column) => {
      this.columnsById[column.id] = column;
      if (column.columns) this.mapToId(column.columns);
    });
  }

  private _filter(node, condition) {
    return node.filter((column) => {
      const valid = condition.call(column);

      if (valid && column.columns)
        column.columns = this._filter(column.columns, condition);

      return valid && (!column.columns || column.columns.length);
    });
  }

  filter(condition) {
    return this._filter(this.cloneTreeColumns(), condition);
  }

  sort(columns, grid) {
    columns
      .sort((a, b) => {
        const indexA = this.getOrDefault(grid.getColumnIndex(a.id)),
          indexB = this.getOrDefault(grid.getColumnIndex(b.id));

        return indexA - indexB;
      })
      .forEach((column) => {
        if (column.columns) this.sort(column.columns, grid);
      });
  }

  getOrDefault(value) {
    return typeof value === "undefined" ? -1 : value;
  }

  private _getDepth(node) {
    if (node.length) for (const i in node) return this._getDepth(node[i]);
    else if (node.columns) return 1 + this._getDepth(node.columns);
    else return 1;
  }

  getDepth() {
    return this._getDepth(this.treeColumns);
  }

  getColumnsInDepth(depth) {
    return this._getColumnsInDepth(this.treeColumns, depth);
  }

  private _getColumnsInDepth(node, depth, current?) {
    let columns = [];
    current = current || 0;

    if (depth == current) {
      if (node.length)
        node.forEach((n) => {
          if (n.columns)
            n.extractColumns = function () {
              return extractColumns(n);
            };
        });

      return node;
    } else
      for (const i in node)
        if (node[i].columns) {
          columns = columns.concat(
            this._getColumnsInDepth(node[i].columns, depth, current + 1)
          );
        }

    return columns;
  }

  private _extractColumns(node: any) {
    let result = [];

    if (node.hasOwnProperty("length")) {
      for (let i = 0; i < node.length; i++)
        result = result.concat(this._extractColumns(node[i]));
    } else {
      if (node.hasOwnProperty("columns"))
        result = result.concat(this._extractColumns(node.columns));
      else return node;
    }

    return result;
  }

  extractColumns() {
    return this.hasDepth()
      ? this._extractColumns(this.treeColumns)
      : this.treeColumns;
  }

  cloneTreeColumns() {
    return $.extend(true, [], this.treeColumns);
  }

  hasDepth() {
    for (const i in this.treeColumns)
      if (this.treeColumns[i].hasOwnProperty("columns")) return true;

    return false;
  }

  getTreeColumns() {
    return this.treeColumns;
  }

  getColumnsInGroup(groups) {
    return this._extractColumns(groups);
  }

  visibleColumns() {
    return this._filter(
      this.cloneTreeColumns(),
      function (this: { visible: boolean }) {
        return this.visible;
      }
    );
  }

  reOrder(grid) {
    return this.sort(this.treeColumns, grid);
  }

  getById(id) {
    return this.columnsById[id];
  }

  getInIds(ids) {
    return ids.map((id) => this.columnsById[id]);
  }
}

/** *
 * Contains core SlickGrid classes.
 * @module Core
 * @namespace Slick
 */
const Slick = {
  Event: Event,
  EventData: EventData,
  EventHandler: EventHandler,
  Range: Range,
  Grid: SlickGrid,
  NonDataRow: NonDataItem,
  Group: Group,
  GroupTotals: GroupTotals,
  EditorLock: EditorLock,
  /** *
   * A global singleton editor lock.
   * @class GlobalEditorLock
   * @static
   * @constructor
   */
  GlobalEditorLock: new EditorLock(),
  TreeColumns: TreeColumns,
  keyCode: {
    BACKSPACE: 8,
    DELETE: 46,
    DOWN: 40,
    END: 35,
    ENTER: 13,
    ESCAPE: 27,
    HOME: 36,
    INSERT: 45,
    LEFT: 37,
    PAGE_DOWN: 34,
    PAGE_UP: 33,
    RIGHT: 39,
    TAB: 9,
    UP: 38,
    SPACE: 32,
  },
};

export default Slick;
function extractColumns(n: any) {
  throw new Error("Function not implemented.");
}
