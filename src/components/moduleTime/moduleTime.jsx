import React, { useState } from 'react';
import { moduleTimeStates, bentoTimeStates } from '../pipelineGenerator/pipelineGenerator';
import './moduleTime.scss';

function renderModulesTimesSelector(modules, setInfo) {
  const moduleTimeStateKeys = Object.keys(moduleTimeStates);
  return Object.keys(modules).sort().map((moduleKey) => {
    const className = `module-time-wrapper module-${moduleKey} `
    return <div key={moduleKey} className={className}>
      {moduleTimeStateKeys.map((state) => {
        const className = `module-time-state ${state}`;
        const name = `${moduleKey}-${state}`
        return <input key={state} value={modules[moduleKey][state]} name={name} className={className} onChange={setInfo}></input>
      })}
    </div>
  });
}

function renderModuleTimesHeader() {
  const moduleTimeStateKeys = Object.keys(moduleTimeStates);
  return <div className='times-header'>
    {moduleTimeStateKeys.map((key) => {
      return <div className='header-box' key={key}> {key} </div>
    })}
  </div>
}

function renderBentoTimesHeader() {
  const bentoTimeStateKeys = Object.keys(bentoTimeStates);
  return <div className='times-header'>
    {bentoTimeStateKeys.map((key) => {
      return <div className='header-box' key={key}> {key} </div>
    })}
  </div>
}

function renderBentoTimesSelector(bento, setBentoInfo) {
  return <div className='bento-time-wrapper'>
    {Object.keys(bentoTimeStates).map((state) => {
      const className = `bento-time-state ${state}`;
      return <input key={state} value={bento[state]} name={state} className={className} onChange={setBentoInfo}></input>
    })}
  </div>
}

export const ModuleTime = ({ info, setInfo }) => {
  const [ timeInfo, setTimeInfo ] = useState(info);
  const { modules, bento } = timeInfo;

  function setModulesInfo(event) {
    const { name, value } = event.target;
    const [ moduleKey, stateName ] = name.split('-');
    setTimeInfo({
      bento,
      modules: {
        ...modules,
        [moduleKey]: {
          ...modules[moduleKey],
          [stateName]: parseInt(value),
        },
      },
    });
  }
  function setBentoInfo(event) {
    const { name, value } = event.target
    setTimeInfo({
      modules,
      bento: {
        ...bento,
        [name]: value,
      },
    });
  }
  function submitInfo() {
    setInfo(timeInfo);
  }

  return <div className='modules-time-wrapper'>
    {renderModuleTimesHeader()}
    {renderModulesTimesSelector(modules, setModulesInfo)}
    {renderBentoTimesHeader()}
    {renderBentoTimesSelector(bento, setBentoInfo)}
    <button onClick={submitInfo}>Submit</button>
  </div>
}
