import { modules, bentoModule } from '../components/pipelineGenerator/pipelineGenerator';

let allModules;

function initialize() {
  allModules = [...modules, bentoModule];
}

function calculatePosition(data, timestamp) {
  let index;
  let version;
  for(let _i = data.length - 1; _i > 0; _i--) {
    if (data[_i - 1].timestamp < timestamp) {
      index = _i;
      version = (data[_i - 1].version + data[_i].version) / 2;
      break;
    }
  }
  return {
    index, version,
  }
}

function getNextVersionToBuild(buildIndex, buildQueue) {
  const { version } = buildQueue[buildIndex + 1] || {};
  return version;
}

export class ModuleBuildScheduler {
  constructor() {
    initialize();
    this.pending = [];
    this.data = allModules.reduce((data, { key }) => {
      return {
        ...data,
        [key]: {
          inProgress: false,
          buildQueue: [{
            version: 0,
            timestamp: 0,
          }],
          buildIndex: 0,
        },
      };
    }, {});
  }

  addToModuleData(moduleKey, insertIndex, versionData) {
    this.data = allModules.reduce((data, { key }) => {
      const { inProgress, buildQueue, buildIndex } = data[key];
      return {
        ...data,
        [key]: key === moduleKey ? {
          inProgress,
          buildIndex,
          buildQueue: [
            ...buildQueue.slice(0, insertIndex),
            versionData,
            ...buildQueue.slice(insertIndex),
          ],
        } : data[key],
      };
    }, { ...this.data });
  }

  addToPending(versionsRequired, resolve) {
    this.pending = [...this.pending, {
      resolve,
      versionsRequired,
    }];
  }

  removeFromPending(removeVersionsRequired) {
    this.pending = this.pending.flatMap((pendingDetails) => {
      const { versionsRequired } = pendingDetails;
      return Object.keys(versionsRequired).every((moduleKey) => versionsRequired[moduleKey] === removeVersionsRequired[moduleKey]) ?
        [] : [pendingDetails];
    });
  }

  getVersion (moduleKey, timestamp) {
    const moduleQueueData = this.data[moduleKey].buildQueue;
    const lastIndex = moduleQueueData.length - 1;
    let insertIndex = lastIndex + 1;
    let version = moduleQueueData[lastIndex].version + 1;
    if (timestamp < moduleQueueData[lastIndex].timestamp) {
      const { index, version: calcVersion } = calculatePosition(moduleQueueData, timestamp);
      insertIndex = index;
      version = calcVersion;
    }
    this.addToModuleData(moduleKey, insertIndex, {
      version,
      timestamp,
    });
    return version;
  }

  scheduleModuleResult(prInfo) {
    return new Promise((resolve, reject) => {
      const versionsRequired = Object.keys(prInfo).reduce((versionsRequired, moduleKey) => {
        return {
          ...versionsRequired,
          [moduleKey]: prInfo[moduleKey].version,
        }
      }, {});

      this.addToPending(versionsRequired, resolve);

      this.checkAndStartPending(true);
    });
  }

  finishResultProcessing(prInfo) {
    const versionsRequired = Object.keys(prInfo).reduce((versionsRequired, moduleKey) => {
      return {
        ...versionsRequired,
        [moduleKey]: prInfo[moduleKey].version,
      }
    }, {});

    this.data = Object.keys(prInfo).reduce((data, moduleKey) => {
      return {
        ...data,
        [moduleKey]: {
          ...data[moduleKey],
          inProgress: false,
        },
      };
    }, { ...this.data });

    this.removeFromPending(versionsRequired);

    this.checkAndStartPending();
  }

  checkAndStartPending(lastOnly) {
    const { nextVersions, presentVersions } = allModules.reduce(({ nextVersions, presentVersions }, { key: moduleKey }) => {
      const { inProgress, buildQueue, buildIndex } = this.data[moduleKey];
      return {
        nextVersions: {
          ...nextVersions,
          [moduleKey]: inProgress ? undefined : getNextVersionToBuild(buildIndex, buildQueue),
        },
        presentVersions: {
          ...presentVersions,
          [moduleKey]: inProgress ? buildQueue[buildIndex].version : undefined,
        },
      }
    }, { nextVersions: {}, presentVersions: {} });

    const checkPendingList = lastOnly ? [this.pending[this.pending.length - 1]] :[ ...this.pending ];
    const { toStart, alreadyStarted } = checkPendingList.reduce(({toStart, alreadyStarted}, { versionsRequired, resolve }) => {
      const shouldStart = Object.keys(versionsRequired).every((moduleKey) => versionsRequired[moduleKey] === nextVersions[moduleKey]);
      const started = Object.keys(versionsRequired).every((moduleKey) => versionsRequired[moduleKey] === presentVersions[moduleKey]);
      return {
        toStart: shouldStart ? [
          ...toStart,
          { versionsRequired, resolve },
         ] : toStart,
         alreadyStarted: started ? [
           ...alreadyStarted,
           { versionsRequired, resolve },
         ] : alreadyStarted,
      }
    }, {
      toStart: [],
      alreadyStarted: [],
    });
    this.startPending(toStart, alreadyStarted);
  }

  startPending(toStartPending, alreadyStarted) {
    const runVersions = toStartPending.reduce((runVersions, { versionsRequired }) => {
      return {
        ...runVersions,
        ...versionsRequired,
      }
    }, {});
    this.data = allModules.reduce((data, { key: moduleKey }) => {
      const runVersion = runVersions[moduleKey];
      return {
        ...data,
        [moduleKey]: runVersion !== undefined ? {
          ...data[moduleKey],
          inProgress: true,
          buildIndex: data[moduleKey].buildIndex + 1,
        }: data[moduleKey],
      }
    }, this.data);

    [...alreadyStarted, ...toStartPending].forEach(({ resolve }) => resolve());
  }
}
