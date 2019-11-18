import React, { useState } from 'react';
import { ModuleTime } from '../moduleTime/moduleTime';
import { PRGenerator } from '../prGenerator/prGenerator';
import { PRBucket } from '../prBucket/prBucket';
import './pipelineGenerator.scss';

export const modules = [
  {
    key: '1',
    name: 'modA',
  },
  {
    key: '2',
    name: 'modB',
  },
  {
    key: '3',
    name: 'modC',
  },
  {
    key: '4',
    name: 'modD',
  },
];

export const bentoModule = {
  key: '0',
  name: 'Bento',
};

export const moduleTimeStates = {
  build: 'build',
  push: 'push',
  ut: 'ut',
  it: 'it',
};

export const bentoTimeStates = {
  build: 'build',
  ut: 'ut',
  it: 'it',
  e2e: 'e2e',
}

const initModuleTimes = {
  [moduleTimeStates.build]: 5,
  [moduleTimeStates.push]: 1,
  [moduleTimeStates.ut]: 4,
  [moduleTimeStates.it]: 5,
}

const initBentoTimes = {
  [bentoTimeStates.build]: 7,
  [bentoTimeStates.ut]: 7,
  [bentoTimeStates.it]: 7,
  [bentoTimeStates.e2e]: 10,
}

const initialModuleTimeInfo = {
  modules: modules.reduce((info, moduleData) => {
    return {
      ...info,
      [moduleData.key]: initModuleTimes,
    }
  }, {}),
  bento: initBentoTimes,
}

export const PipelineGenerator = ({ build, blockRolloutState, setBlockRollout }) => {

  const [ moduleTimeInfo, setModuleTimeInfo ] = useState(initialModuleTimeInfo);
  const [ prBucket, setPRBucket ] = useState([]);

  function addPR(prInfo) {
    setPRBucket([
      ...prBucket,
      prInfo,
    ]);
  }

  function mergePR(index) {
    build({
      prInfo: prBucket[index],
      timingInfo: moduleTimeInfo,
    });
    removePR(index);
  }

  function removePR(index) {
    setPRBucket([
      ...prBucket.slice(0, index),
      ...prBucket.slice(index + 1),
    ]);
  }
  

  return <div className='p-g-wrapper'>
    <ModuleTime info={moduleTimeInfo} setInfo={setModuleTimeInfo} />
    <PRGenerator addPR={addPR} blockRolloutState={blockRolloutState} setBlockRollout={setBlockRollout} />
    <PRBucket mergePR={mergePR} removePR={removePR} prs={prBucket} />
  </div>
}
