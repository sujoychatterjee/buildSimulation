import React from 'react';
import './releaseQueue.scss';

export function sortModules({key: key1}, {key: key2}) {
  const key1Num = parseInt(key1);
  const key2Num = parseInt(key2);
  return key1Num === 0 ? 1 : key2Num === 0 ? -1 : key1Num - key2Num;
}

function getReleaseColumn(modules) {
  return modules.sort(sortModules).map((moduleInfo, index) => {
    const { state, subState, inProgress, text, unchanged } = moduleInfo;
    const unchangedClass = `${unchanged && text === undefined ? 'unchanged' : unchanged && text !== undefined ? 'unchanged-show' : ''}`;
    const moduleClass = `module-box module-state-${state} module-sub-state-${subState} ${inProgress ? 'in-progress': ''} ${unchangedClass}`;
    return <div className='module-box-wrapper' key={index}>
      <div className={moduleClass} ><span className='module-text'>{text}</span><div className='overlay'></div></div>
    </div>;
  });
}

function renderThrottleBuildInfo(buildInfo, key) {
  const buildClassName = `throttle-build type-${key % 2}`;
  return <div className={buildClassName} key={key}>
  {
    Object.keys(buildInfo).map((moduleKey) => ({ key: moduleKey })).sort(sortModules).map(({ key: moduleKey }) => {
    return <div key={moduleKey} className='throttle-version'>
      { buildInfo[moduleKey] }
    </div>
    })
  }
  </div>;
}

function renderThrottleInfo(throttleQueue) {
  if (throttleQueue) {
    return <div className='throttle-queue'>
      {throttleQueue.map((buildInfo, index) => {
        return renderThrottleBuildInfo(buildInfo, index);
      }).reverse()}
    </div>
  }
}

export const ReleaseQueue = ({ data, throttleQueue }) => {
  const { queueInfo, modulesInfo } = data;
  return <div className='release-queue-wrapper'>
    <div className='module-info'>
      {modulesInfo.sort(sortModules).map(({ name, key }) => {
        return <div key={key} className='module-name'>
          { name }
        </div>
      })}
    </div>
    {renderThrottleInfo(throttleQueue)}
    <div className="release-queue">
      {queueInfo.map(({ release: { state, subState, inProgress }, modules }, index) => {
      const classNames = `release-column release-state-${state} release-sub-state-${subState} ${inProgress ? 'in-progress' : ''}`
      return <div key={index} className={classNames}>
        {getReleaseColumn(modules)}
      </div>
      } ).reverse()}
    </div>
  </div>;
}
