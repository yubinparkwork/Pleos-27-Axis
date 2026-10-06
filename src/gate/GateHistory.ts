import type { GateState } from './GateState';
const differs=(a:GateState,b:GateState)=>(Object.keys(a) as (keyof GateState)[]).some(k=>a[k]!==b[k]);
/** Editing snapshots only: the continuously running transport is never undone. */
export class GateHistory {
  private past:GateState[]=[];
  private future:GateState[]=[];
  private before?:GateState;
  private changed=false;
  get canUndo(){return this.past.length>0||this.changed;}
  get canRedo(){return this.future.length>0;}
  begin(state:GateState){this.before??={...state};}
  record(before:GateState,after:GateState){if(differs(before,after)){this.future.length=0;if(!this.before)this.push(before);else this.changed=true;}}
  end(state:GateState){const before=this.before;this.before=undefined;this.changed=false;if(before&&differs(before,state))this.push(before);}
  undo(state:GateState){this.end(state);const next=this.past.pop();if(next)this.future.push({...state});return next;}
  redo(state:GateState){this.end(state);const next=this.future.pop();if(next)this.past.push({...state});return next;}
  private push(state:GateState){this.past.push({...state});if(this.past.length>100)this.past.shift();this.future.length=0;}
}
