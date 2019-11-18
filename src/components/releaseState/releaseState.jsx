import React from 'react';
import './releaseState.scss';
import { modules, bentoModule } from '../pipelineGenerator/pipelineGenerator';
import { sortModules } from '../releaseQueue/releaseQueue';

function renderVersion(version) {
  return version !== undefined ? <div className='module-version'>{version}</div> : null;
}

function renderFrozenVersion(frozenInfo, moduleKey, { blocked, dependencyBlocked }) {
  if (!frozenInfo) {
    return null;
  }
  const frozen = frozenInfo[moduleKey];
  const frozenClass = `module-frozen ${frozen ? 'frozen' : ''} ${blocked || dependencyBlocked.length ? 'blocked-rollout' : ''}`;
  return <div className={frozenClass}></div>;
}

function renderModuleInfo(name, key, versionInfo, frozenInfo, forwardedInfo, blockedRolloutInfo ) {
  const keyStr = key.toString();
  const version = versionInfo ? versionInfo[keyStr] : undefined;
  const forwardedVersion = forwardedInfo[keyStr];
  const blockedRollout = blockedRolloutInfo ? blockedRolloutInfo[keyStr] : {blocked: false, dependencyBlocked: []};
  return <div key={key} className='module-info-wrapper'>
    <div className='module-name'>{name}</div>
    {renderVersion(version)}
    {renderFrozenVersion(frozenInfo, keyStr, blockedRollout)}
    <div className='module-forwarded'>{forwardedVersion}</div>
  </div>;
}

function renderModulesInfo(gsVersions, frozenInfo, forwardedInfo, blockedRolloutInfo) {
  const allModules = [...modules, bentoModule];
  return <div className='modules-info-wrapper'>
    {allModules.sort(sortModules).map(({ name, key }) => renderModuleInfo(name, key, gsVersions, frozenInfo, forwardedInfo[forwardedInfo.length - 1], blockedRolloutInfo))}
  </div>;
}

export const ReleaseState = ({ gsVersions, frozenInfo, forwardedInfo, e2eStatus, blockedRolloutInfo }) => {
  const className = `release-state-wrapper ${e2eStatus === 'passing' ? 'e2e-good' : e2eStatus === 'failing' ? 'e2e-broken' : ''}`;
  return <div className={className}>
    {renderModulesInfo(gsVersions, frozenInfo, forwardedInfo, blockedRolloutInfo)}
  </div>;
}