import React, { useState } from 'react';
import './prGenerator.scss';
import { modules } from '../pipelineGenerator/pipelineGenerator';
import { isModuleBrokenForState } from '../../helpers/jenkinsBuild';

export const prStates = {
  unchanged: 0,
  buildUTITFail: 1,
  buildUTITPass: 2,
  fullBuildUTITFail: 3,
  fullBuildUTITPass: 4,
  e2eFail: 5,
  e2ePass: 6,
  pass: 7,
}

const passStates = [prStates.buildUTITPass, prStates.fullBuildUTITPass, prStates.e2ePass];
const failStates = [prStates.buildUTITFail, prStates.fullBuildUTITFail, prStates.e2eFail];

function isDownStreamBroken(moduleKey, state) {
  return failStates.some((failState) => {
    return failState > state && isModuleBrokenForState(moduleKey, undefined, failState, failState + 1);
  });
}

function isUpStreamBroken(moduleKey, state) {
  return failStates.some((failState) => {
    return failState < state && isModuleBrokenForState(moduleKey, undefined, failState, failState + 1);
  });
}

function shouldShowModuleGreen(state, moduleKey) {
  return isModuleBrokenForState(moduleKey, undefined, state, state + 1) &&
    ((state === prStates.e2eFail && isUpStreamBroken(moduleKey, state)) || isDownStreamBroken(moduleKey, state))
};

function getNextState(state, moduleKey) {
  if (state === prStates.pass) {
    return prStates.unchanged;
  } else if (state === prStates.unchanged || passStates.includes(state) || shouldShowModuleGreen(state, moduleKey)) {
    return state + 1;
  }
  return state + 2;
}

export const PRModule = ({state, moduleKey, onClickFn}) => {
  const className = `pr-module state-${state} module-${moduleKey} ${onClickFn ? 'clickable' : ''}`;
  const name = `${moduleKey}-${state}`;
  return <div className='pr-module-wrapper'>
    <div name={name} onClick={onClickFn} className={className}></div>
  </div>;
} 

function renderModuleNames(blockRolloutState, setBlockRollout) {
  const allModules = [...modules, { name: 'bento', key: 0 }];
  return <div className='module-names'>
    <div className='module-names-header'><span>Modules</span><span>Block_Auto_Rollout</span></div>
    {allModules.map(({name, key}) => {
      const className = `module-name ${name}`
      return <div key={name} className={className}>{name} <input type='checkbox' name={key} checked={blockRolloutState[key].blocked} onChange={setBlockRollout} /></div>;
    })}
  </div>
}

function renderPRGen(newPR, changeModulePRState, addPR) {
  const allModules = [ ...modules.map(({key}) => key ), 0];
  return <div className='generator-wrapper'>
    <div className='pr-gen-header'>
    Select Module State
    </div>
    {allModules.map((key) => {
      return <PRModule key={key} state={newPR[key].state} moduleKey={key} onClickFn={changeModulePRState} />
    })}
    <button onClick={addPR} >Add PR</button>
  </div>;
}

function prCheck(prData) {
  return new Promise((resolve, reject) => {
    const hasChange = Object.keys(prData).every((key) => prData[key].state === prStates.unchanged);
    const frozen = [];
    if (hasChange) {
      reject({ errText: 'PR should have some change' });
    } else if (frozen.length) {
      if (confirm(`These packages are frozen: ${frozen.join(',')}. Do you want to force merge?`)) {
        resolve();
      } else {
        reject({ errText:  ''});
      }      
    }
    else {
      resolve();
    }
  })
}

export const PRGenerator = ({addPR, blockRolloutState, setBlockRollout}) => {

  const initNewPR = modules.reduce((initNewPR, moduleInfo) => {
    return {
      ...initNewPR,
      [moduleInfo.key]: {
        state: prStates.unchanged,
      }
    }
  }, {
    0: {
      state: prStates.unchanged,
    }
  });
  const [ newPR, setNewPR ] = useState(initNewPR);

  function onAddPR() {
    prCheck(newPR).then(() => {
      addPR(newPR);
      setNewPR(initNewPR);
    }).catch(({errText}) => errText ? alert(errText) : undefined);
  }

  function changeModulePRState(event) {
    const [ moduleKey, stateStr ] = event.target.getAttribute('name').split('-');
    const state = parseInt(stateStr);
    setNewPR({
      ...newPR,
      [moduleKey]: {
        state: getNextState(state, moduleKey),
      },
    });
  }

  function onChangeBlockRollout(event) {
    const {name, checked} = event.target;
    setBlockRollout(name, { blocked: checked });
  }

  return <div className='pr-gen-wrapper'>
    {renderModuleNames(blockRolloutState, onChangeBlockRollout)}
    {renderPRGen(newPR, changeModulePRState, onAddPR)}
  </div>
}