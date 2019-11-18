import React, { useState } from 'react';
import './prBucket.scss';
import { PRModule } from '../prGenerator/prGenerator';

const viewStates = {
  bucket: 'bucket',
  merged: 'merged',
};

function moduleKeySort(key1, key2) {
  const key1Num = parseInt(key1);
  const key2Num = parseInt(key2);
  if (!key1Num) return 1;
  if (!key2Num) return -1;
  return key1Num - key2Num;
}

function renderPRs({prs, mergePR, removePR}) {
  return prs.map((prInfo, index) => {
    const mergePRButton = mergePR ? <button className='merge' name={index} onClick={mergePR} >Merge</button> : null;
    const removePRButton = removePR ? <button name={index} onClick={removePR} >Remove</button> : null;
    return <div key={index} className='pr-bucket-content'>
      {Object.keys(prInfo).sort(moduleKeySort).map((key) => {
        return <PRModule key={key} state={prInfo[key].state} moduleKey={key}/>;
      })}
      {mergePRButton}
      {removePRButton}
    </div>
  }).reverse();
}

export const PRBucket = ({ mergePR, removePR, prs }) => {
  const [activeState, setActiveState] = useState(viewStates.bucket);
  const [mergedPRs, setMergedPRs] = useState([]);

  function onMergePRClick(event) {
    const index = event.target.name;
    setMergedPRs([...mergedPRs, prs[index]]);
    mergePR(parseInt(index));
  }

  function onRemovePRClick(event) {
    const index = event.target.name;
    removePR(parseInt(index));
  }

  function changeView() {
    setActiveState(activeState === viewStates.bucket ? viewStates.merged : viewStates.bucket);
  }

  const isBucketState = activeState === viewStates.bucket;
  const bucketClass = isBucketState ? 'active' : '';
  const mergedClass = activeState === viewStates.merged ? 'active' : '';

  return <div className='pr-bucket-wrapper'>
    <div className='pr-bucket-content-header' onClick={changeView}><span className={bucketClass}>Pending PRs</span><span className={mergedClass}>Merged PRs</span></div>
    <div className='pr-bucket-content-wrapper'>
      {renderPRs({
        prs: isBucketState ? prs : mergedPRs,
        mergePR: isBucketState ? onMergePRClick : undefined,
        removePR: isBucketState ? onRemovePRClick : undefined,
      })}
    </div>
  </div>
}
