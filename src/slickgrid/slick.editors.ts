/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable no-constant-condition */
import Slick from './slick.core';
import flatpickr from 'flatpickr';
//import 'flatpickr/dist/flatpickr.min.css';
import $ from 'jquery';

const { keyCode } = Slick;

class TextEditor {

  private args;

  constructor(args) {
    this.args = args;
    this.init();
  }

  private $input;
  private defaultValue;

  private init = () => {
    this.$input = $("<INPUT type=text class='editor-text' />")
      .appendTo(this.args.container)
      .bind('keydown.nav', e => {
        if (e.keyCode === keyCode.LEFT || e.keyCode === keyCode.RIGHT){
          e.stopImmediatePropagation();
        }
      })
      .focus()
      .select();
  };

  private destroy = () => {
    this.$input.remove();
  };

  private focus = () => {
    this.$input.focus();
  };

  private getValue = () => this.$input.val();

  private setValue = val => {
    this.$input.val(val);
  };

  private loadValue = item => {
    this.defaultValue = item[this.args.column.field] || '';
    this.$input.val(this.defaultValue);
    this.$input[0].defaultValue = this.defaultValue;
    this.$input.select();
  };

  private serializeValue = () => this.$input.val();

  private applyValue = (item, state) => {
    item[this.args.column.field] = state;
  };

  private isValueChanged = () => (!(this.$input.val() == '' && this.defaultValue == null)) && (this.$input.val() != this.defaultValue);

  private validate = () => {
    let valid = true;
    let msg = null;
    if (this.args.column.validator){
      let validationResults = this.args.column.validator(this.$input.val(), this.args);
      valid = validationResults.valid;
      msg = validationResults.msg;
    }

    return {
      valid: true,
      msg: null
    };
  };

}

class IntegerEditor {

  private args;

  constructor(args) {
    this.args = args;
    this.init();
  }

  private $input;
  private defaultValue;

  private init = () => {
    this.$input = $("<INPUT type=text class='editor-text' />");

    this.$input.bind('keydown.nav', e => {
      if (e.keyCode === keyCode.LEFT || e.keyCode === keyCode.RIGHT){
        e.stopImmediatePropagation();
      }
    });

    this.$input.appendTo(this.args.container);
    this.$input.focus().select();
  };

  private destroy = () => {
    this.$input.remove();
  };

  private focus = () => {
    this.$input.focus();
  };

  private loadValue = item => {
    this.defaultValue = item[this.args.column.field];
    this.$input.val(this.defaultValue);
    this.$input[0].defaultValue = this.defaultValue;
    this.$input.select();
  };

  private serializeValue = () => parseInt(this.$input.val(), 10) || 0;

  private applyValue = (item, state) => {
    item[this.args.column.field] = state;
  };

  private isValueChanged = () => (!(this.$input.val() == '' && this.defaultValue == null)) && (this.$input.val() != this.defaultValue);

  private validate = () => {
    if (isNaN(this.$input.val())){
      return {
        valid: false,
        msg: 'Please enter a valid integer'
      };
    }

    if (this.args.column.validator){
      let validationResults = this.args.column.validator(this.$input.val());
      if (!validationResults.valid){
        return validationResults;
      }
    }

    return {
      valid: true,
      msg: null
    };
  };

}

class FloatEditor {

  static DefaultDecimalPlaces = null;

  private args;

  constructor(args) {
    this.args = args;
    this.init();
  }

  private $input;
  private defaultValue;
  private scope = this;

  private init = () => {
    this.$input = $("<INPUT type=text class='editor-text' />");

    this.$input.bind('keydown.nav', e => {
      if (e.keyCode === keyCode.LEFT || e.keyCode === keyCode.RIGHT){
        e.stopImmediatePropagation();
      }
    });

    this.$input.appendTo(this.args.container);
    this.$input.focus().select();
  };

  private destroy = () => {
    this.$input.remove();
  };

  private focus = () => {
    this.$input.focus();
  };

  ///
  private getDecimalPlaces(){
    // returns the number of fixed decimal places or null
    let rtn = this.args.column.editorFixedDecimalPlaces;
    if (typeof rtn == 'undefined'){
      rtn = FloatEditor.DefaultDecimalPlaces;
    }
    return (!rtn && rtn !== 0 ? null : rtn);
  }

  private loadValue = item => {
    this.defaultValue = item[this.args.column.field];

    let decPlaces = this.getDecimalPlaces();
    if (decPlaces !== null
      && (this.defaultValue || this.defaultValue === 0)
      && this.defaultValue.toFixed){
      this.defaultValue = this.defaultValue.toFixed(decPlaces);
    }

    this.$input.val(this.defaultValue);
    this.$input[0].defaultValue = this.defaultValue;
    this.$input.select();
  };

  private serializeValue = () => {
    let rtn = parseFloat(this.$input.val()) || 0;

    let decPlaces = this.getDecimalPlaces();
    if (decPlaces !== null
      && (rtn || rtn === 0)
      && rtn.toFixed){
      rtn = parseFloat(rtn.toFixed(decPlaces));
    }

    return rtn;
  };

  private applyValue = (item, state) => {
    item[this.args.column.field] = state;
  };

  private isValueChanged = () => (!(this.$input.val() == '' && this.defaultValue == null)) && (this.$input.val() != this.defaultValue);

  private validate = () => {
    if (isNaN(this.$input.val())){
      return {
        valid: false,
        msg: 'Please enter a valid number'
      };
    }

    if (this.args.column.validator){
      let validationResults = this.args.column.validator(this.$input.val(), this.args);
      if (!validationResults.valid){
        return validationResults;
      }
    }

    return {
      valid: true,
      msg: null
    };
  };

}


/**
 * see https://chmln.github.io/flatpickr/#options - pass as column.options.date = {}
 * @param args
 * @constructor
 */
class DateEditor {

  private args;

  constructor(args) {
    this.args = args;
    this.init();
    this.options = this.args.column.options && this.args.column.options.date ? this.args.column.options.date : {};
  }

  private $input;
  private flatInstance;
  private defaultDate;
  private options

  private init = () => {
    this.defaultDate = this.options.defaultDate = this.args.item[this.args.column.field];

    this.$input = $('<input type=text data-default-date="'+this.defaultDate+'" class="editor-text" />');
    this.$input.appendTo(this.args.container);
    this.$input.focus().val(this.defaultDate).select();
    this.flatInstance = flatpickr(this.$input[0], this.options);
  };

  private destroy = () => {
    this.flatInstance.destroy();
    this.$input.remove();
  };

  private show = () => {
    this.flatInstance.open();
    this.flatInstance.positionCalendar();
  };

  private hide = () => {
    this.flatInstance.close();
  };

  private position = position => {
    //todo: fix how scrolling is affected
    this.flatInstance.positionCalendar();
  };

  private focus = () => {
    this.$input.focus();
  };

  private loadValue = item => {
    this.defaultDate = item[this.args.column.field];
    this.$input.val(this.defaultDate);
    this.$input.select();
  };

  private serializeValue = () => this.$input.val();

  private applyValue = (item, state) => {
    item[this.args.column.field] = state;
  };

  private isValueChanged = () => (!(this.$input.val() == '' && this.defaultDate == null)) && (this.$input.val() != this.defaultDate);

  private validate = () => {
    if (this.args.column.validator){
      let validationResults = this.args.column.validator(this.$input.val(), this.args);
      if (!validationResults.valid){
        return validationResults;
      }
    }

    return {
      valid: true,
      msg: null
    };
  };

}

class YesNoSelectEditor {

  private args;

  constructor(args) {
    this.args = args;
    this.init();
  }

  private $select;
  private defaultValue;
  private scope = this;

  private init = () => {
    this.$select = $("<select tabIndex='0' class='editor-yesno'><option value='yes'>Yes</option><option value='no'>No</option></select>");
    this.$select.appendTo(this.args.container);
    this.$select.focus();
  };

  private destroy = () => {
    this.$select.remove();
  };

  private focus = () => {
    this.$select.focus();
  };

  private loadValue = item => {
    this.$select.val((this.defaultValue = item[this.args.column.field]) ? 'yes' : 'no');
    this.$select.select();
  };

  private serializeValue = () => this.$select.val() == 'yes';

  private applyValue = (item, state) => {
    item[this.args.column.field] = state;
  };

  private isValueChanged = () => this.$select.val() != this.defaultValue;

  private validate = () => {
    let valid = true;
    let msg = null;
    if (this.args.column.validator){
      let validationResults = this.args.column.validator(this.$select.val(), this.args);
      valid = validationResults.valid;
      msg = validationResults.msg;
    }

    return {
      valid: true,
      msg: null
    };
  };

}

class CheckboxEditor {

  private args;

  constructor(args) {
    this.args = args;
    this.init();
  }

  private $select;
  private defaultValue;
  private scope = this;

  private init = () => {
    this.$select = $("<INPUT type=checkbox value='true' class='editor-checkbox' hideFocus>");
    this.$select.appendTo(this.args.container);
    this.$select.focus();
  };

  private destroy = () => {
    this.$select.remove();
  };

  private focus = () => {
    this.$select.focus();
  };

  private loadValue = item => {
    this.defaultValue = !!item[this.args.column.field];
    if (this.defaultValue){
      this.$select.prop('checked', true);
    } else {
      this.$select.prop('checked', false);
    }
  };

  private serializeValue = () => this.$select.prop('checked');

  private applyValue = (item, state) => {
    item[this.args.column.field] = state;
  };

  ///
  private isValueChanged () {
    return (this.serializeValue() !== this.defaultValue);
  };

  private validate = () => {
    let valid = true;
    let msg = null;
    if (this.args.column.validator){
      let validationResults = this.args.column.validator(this.$select.val(), this.args);
      valid = validationResults.valid;
      msg = validationResults.msg;
    }

    return {
      valid: true,
      msg: null
    };
  };

}


/*
 * An example of a "detached" editor.
 * The UI is added onto document BODY and .position(), .show() and .hide() are implemented.
 * KeyDown events are also handled to provide handling for Tab, Shift-Tab, Esc and Ctrl-Enter.
 */
class LongTextEditor {

  private args;

  constructor(args) {
    this.args = args;
    this.init();
  }

  private $input;
  private $wrapper;
  private defaultValue;
  private scope = this;

  ///
  private init () {
    let $container = $('body');

    this.$wrapper = $("<div class='slick-large-editor-text' />").appendTo($container);
    this.$input = $("<textarea hidefocus rows=5 />").appendTo(this.$wrapper);

    $("<div><button>Save</button> <button>Cancel</button></div>").appendTo(this.$wrapper);

    this.$wrapper.find('button:first').bind('click', this.save);
    this.$wrapper.find('button:last').bind('click', this.cancel);
    this.$input.bind('keydown', this.handleKeyDown);

    this.scope.position(this.args.position);
    this.$input.focus().select();
  };

  private handleKeyDown = e => {
    if (e.which == keyCode.ENTER && e.ctrlKey){
      this.scope.save();
    } else if (e.which == keyCode.ESCAPE){
      e.preventDefault();
      this.scope.cancel();
    } else if (e.which == keyCode.TAB && e.shiftKey){
      e.preventDefault();
      this.args.grid.navigatePrev();
    } else if (e.which == keyCode.TAB){
      e.preventDefault();
      this.args.grid.navigateNext();
    }
  };

  private save = () => {
    this.args.commitChanges();
  };

  private cancel = () => {
    this.$input.val(this.defaultValue);
    this.args.cancelChanges();
  };

  private hide = () => {
    this.$wrapper.hide();
  };

  private show = () => {
    this.$wrapper.show();
  };

  private position = position => {
    this.$wrapper
      .css('top', position.top - 5)
      .css('left', position.left - 5);
  };

  private destroy = () => {
    this.$wrapper.remove();
  };

  private focus = () => {
    this.$input.focus();
  };

  private loadValue = item => {
    this.$input.val(this.defaultValue = item[this.args.column.field]);
    this.$input.select();
  };

  private serializeValue = () => this.$input.val();

  private applyValue = (item, state) => {
    item[this.args.column.field] = state;
  };

  private isValueChanged = () => (!(this.$input.val() == '' && this.defaultValue == null)) && (this.$input.val() != this.defaultValue);

  private validate = () => {
    let valid = true;
    let msg = null;
    if (this.args.column.validator){
      let validationResults = this.args.column.validator(this.$input.val(), this.args);
      valid = validationResults.valid;
      msg = validationResults.msg;
    }

    return {
      valid: true,
      msg: null
    };
  };

}
/** *
 * Contains basic SlickGrid editors.
 * @module Editors
 * @namespace Slick
 */

const Editors = {
  Text: TextEditor,
  Integer: IntegerEditor,
  Float: FloatEditor,
  Date: DateEditor,
  YesNoSelect: YesNoSelectEditor,
  Checkbox: CheckboxEditor,
  LongText: LongTextEditor
};

export default Editors;
