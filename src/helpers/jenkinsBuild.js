import { prStates } from '../components/prGenerator/prGenerator';
import { modules, bentoModule, moduleTimeStates, bentoTimeStates } from '../components/pipelineGenerator/pipelineGenerator';
import { pipelineState } from '../components/wrapper';
import { ModuleBuildScheduler } from './moduleBuildScheduler';

//--------------------------
let latestVirtualVersions;
let frozenArchive;
let blockedRolloutInfo;
let moduleGSVersions;
let previousModuleGSVersions;
let moduleBuildScheduler;
//--------------------------

let allModules;
let brokenInfo;
let wrapperSetBlockRolloutModuleState;
let realToVirtualVersion = {};
let releaseInProgress = false;
let releaseThrottled = false;
let releases = [];

function addToRelease(buildInfo, prInfo, timingInfo) {
  const { buildInfo: lastReleaseBuildInfo } = releases[releases.length - 1] || {buildInfo : {}};
  const { lastReleaseScore, releaseScore } = allModules.reduce(({lastReleaseScore, releaseScore}, { key: moduleKey }) => ({
    lastReleaseScore: lastReleaseScore + (lastReleaseBuildInfo[moduleKey] || 0),
    releaseScore: releaseScore + buildInfo[moduleKey],
  }), {
    lastReleaseScore: 0,
    releaseScore: 0,
  });
  if (releaseScore > lastReleaseScore) {
    releases = [ ...releases, { buildInfo, prInfo, timingInfo} ];
    return true;
  }
  return false;
}

function createRealToVirtualVersionMap(prInfoWithVersions, prInfoWithVirtualVersions) {
  realToVirtualVersion = Object.keys(prInfoWithVersions).reduce((realToVirtualVersion, moduleKey) => ({
    ...realToVirtualVersion,
    [moduleKey]: {
      ...(realToVirtualVersion[moduleKey] || {}),
      [prInfoWithVersions[moduleKey].version]: prInfoWithVirtualVersions[moduleKey].version,
    }
  }), realToVirtualVersion);
}

export function initialize(setBlockRolloutModuleState) {
  wrapperSetBlockRolloutModuleState = setBlockRolloutModuleState
  allModules = [...modules, bentoModule];
  brokenInfo = allModules.reduce((brokenInfo, moduleInfo) => {
    return {
      ...brokenInfo,
      [moduleInfo.key]: Object.keys(prStates).reduce((modulePRStateErrors, prState) => {
        const prStateKey = prStates[prState];
        return prStateKey === prStates.unchanged ? modulePRStateErrors : {
          ...modulePRStateErrors,
          [prStateKey]: [],
        }
      }, {}),
    }
  }, {});
  latestVirtualVersions = allModules.reduce((latestVirtualVersions, { key }) => {
    return {
      ...latestVirtualVersions,
      [key]: 0,
    }
  }, {});
  moduleGSVersions = allModules.reduce((moduleGSVersions, { key }) => {
    return {
      ...moduleGSVersions,
      [key]: 0,
    }
  }, {});
  previousModuleGSVersions = allModules.reduce((previousModuleGSVersions, { key }) => {
    return {
      ...previousModuleGSVersions,
      [key]: 0,
    }
  }, {});
  frozenArchive = allModules.reduce((frozenArchive, moduleInfo) => {
    return {
      ...frozenArchive,
      [moduleInfo.key]: {
        frozen: false,
        dependentBreakModules: [],
      },
    };
  }, {});
  blockedRolloutInfo = allModules.reduce((blockedRolloutInfo, {key}) => {
    return {
      ...blockedRolloutInfo,
      [key]: {
        blocked: key === bentoModule.key ? true : false,
        dependencyBlocked: [],
      },
    };
  }, {});
  realToVirtualVersion = allModules.reduce((realToVirtualVersion, {key}) => {
    return {
      ...realToVirtualVersion,
      [key]: {},
    };
  }, {});

  Object.keys(blockedRolloutInfo).forEach((moduleKey) => {
    wrapperSetBlockRolloutModuleState(moduleKey, blockedRolloutInfo[moduleKey]);
  });

  moduleBuildScheduler = new ModuleBuildScheduler();
}

export function setBlockRollout(moduleKey, { blocked, dependencyBlocked }) {
  if (blocked === true) {
    blockedRolloutInfo = Object.keys(blockedRolloutInfo).reduce((blockedRolloutInfo, checkModuleKey) => {
      return {
        ...blockedRolloutInfo,
        [checkModuleKey]: {
          blocked: checkModuleKey === moduleKey ? true : blockedRolloutInfo[checkModuleKey].blocked,
          dependencyBlocked: blockedRolloutInfo[checkModuleKey].dependencyBlocked,
        },
      };
    }, blockedRolloutInfo);
    wrapperSetBlockRolloutModuleState(moduleKey, {
      blocked: true,
    });
  } else if (blocked === false){
    const canBeUnblockedKeys = Object.keys(blockedRolloutInfo).reduce((canBeUnblockedKeys, checkModuleKey) => {
      const canBeUnblocked = getCanBeUnblockedForRollout(blockedRolloutInfo, checkModuleKey, [moduleKey]);
      return canBeUnblocked ? [
        ...canBeUnblockedKeys,
        checkModuleKey,
      ] : canBeUnblockedKeys;
    }, []);
    blockedRolloutInfo = allModules.reduce((blockedRolloutInfo, { key }) => {
      const keyStr = key.toString();
      return {
        ...blockedRolloutInfo,
        [keyStr]: {
          blocked: keyStr === moduleKey ? false : blockedRolloutInfo[keyStr].blocked,
          dependencyBlocked: canBeUnblockedKeys.includes(keyStr) ? [] : canBeUnblockedKeys.reduce((dependencyBlocked, unblockedModuleKey) => {
            const removeIndex = dependencyBlocked.indexOf(unblockedModuleKey);
            return removeIndex === -1 ? dependencyBlocked : [
              ...dependencyBlocked.slice(0, removeIndex),
              ...dependencyBlocked.slice(removeIndex + 1),
            ]
          }, blockedRolloutInfo[keyStr].dependencyBlocked),
        },
      };
    }, blockedRolloutInfo);
    Object.keys(blockedRolloutInfo).forEach((moduleKey) => {
      wrapperSetBlockRolloutModuleState(moduleKey, blockedRolloutInfo[moduleKey]);
    });
  } else if (dependencyBlocked) {
    wrapperSetBlockRolloutModuleState(moduleKey, {
      dependencyBlocked,
    });
  }
}

function setModuleGS(moduleKey, version) {
  moduleGSVersions = {
    ...moduleGSVersions,
    [moduleKey]: version,
  };
}

function setAllPreviousModuleGSVersions(buildInfo) {
  previousModuleGSVersions = allModules.reduce((previousModuleGSVersions, { key: moduleKey }) => {
    return {
      ...previousModuleGSVersions,
      [moduleKey]: buildInfo[moduleKey],
    }
  }, {});
}

function removeDependentFreezes(frozenArchive, greenModuleKeys, previouslyFrozen) {
  const unfrozenModuleKeys = Object.keys(frozenArchive).filter((moduleKey) => {
    return previouslyFrozen.includes(moduleKey) && ( greenModuleKeys.includes(moduleKey) || getCanBeUnforzen(frozenArchive, moduleKey, greenModuleKeys) );
  });


  if (unfrozenModuleKeys.length) {
    const frozenArchiveNew = allModules.reduce((frozenArchive, { key: moduleKey }) => {
      const { dependentBreakModules } = frozenArchive[moduleKey];
      return {
        ...frozenArchive,
        [moduleKey]: unfrozenModuleKeys.includes(moduleKey) ? {
          frozen: false,
          dependentBreakModules: [],
        } : {
          frozen: frozenArchive[moduleKey].frozen,
          dependentBreakModules: unfrozenModuleKeys.reduce((dependentBreakModules, unfrozenModuleKey) => {
            const unfrozenModuleIndex = dependentBreakModules.indexOf(unfrozenModuleKey);
            return unfrozenModuleIndex === -1 ? dependentBreakModules : [
              ...dependentBreakModules.slice(0, unfrozenModuleIndex),
              ...dependentBreakModules.slice(unfrozenModuleIndex + 1),
            ];
          }, dependentBreakModules),
        }
      };
    }, { ...frozenArchive });

    return {
      frozenArchive: frozenArchiveNew,
      unfrozenModuleKeys,
    }
  } else {
    return {
      frozenArchive,
      unfrozenModuleKeys: [],
    }
  }
}

function getCanBeUnforzen(frozenArchive, moduleKey, greenModuleKeys, chainModuleKeys = []) {
  const otherDependentModules = frozenArchive[moduleKey].dependentBreakModules.filter((dependencyModuleKey) => !greenModuleKeys.includes(dependencyModuleKey));
  let state = false;
  if (chainModuleKeys.includes(moduleKey)) {
    state = true;
  } else if (frozenArchive[moduleKey].frozen) {
    state = false;
  } else if (!otherDependentModules.length) {
    state = true;
  } else {
    state = otherDependentModules.every((otherModuleKey) => getCanBeUnforzen(frozenArchive, otherModuleKey, greenModuleKeys, [...chainModuleKeys, moduleKey]));
  }

  return state;
}

function getCanBeUnblockedForRollout(blockedInfo, moduleKey, unblockedModuleKeys, chainModuleKeys = []) {
  const otherDependentModules = blockedInfo[moduleKey].dependencyBlocked.filter((dependencyModuleKey) => !unblockedModuleKeys.includes(dependencyModuleKey));
  let state = false;
  if (chainModuleKeys.includes(moduleKey)) {
    state = true;
  } else if (blockedInfo[moduleKey].blocked) {
    state = false;
  } else if (!otherDependentModules.length) {
    state = true;
  } else {
    state = otherDependentModules.every((otherModuleKey) => getCanBeUnblockedForRollout(blockedInfo, otherModuleKey, unblockedModuleKeys, [...chainModuleKeys, moduleKey]));
  }

  return state;
}

function updatefrozenArchiveonSuccess(moduleIds) {
  return new Promise((resolve, reject) => {

    const previouslyFrozen = allModules.reduce((previouslyFrozen, { key: moduleKey }) => {
      const { frozen, dependentBreakModules } = frozenArchive[moduleKey];
      if (frozen || dependentBreakModules.length !== 0) {
        return [...previouslyFrozen, moduleKey];
      }
      return previouslyFrozen;
    }, []);

    frozenArchive = moduleIds.reduce((frozenArchive, moduleKey) => {
      return {
        ...frozenArchive,
        [moduleKey]: {
          frozen: false,
          dependentBreakModules: frozenArchive[moduleKey].dependentBreakModules,
        }
      };
    }, frozenArchive);


    const continueFozen = moduleIds.reduce((continueFozen, moduleKey) => {
      const canBeUnforzen = getCanBeUnforzen(frozenArchive, moduleKey, moduleIds);
      const prevFrozen = previouslyFrozen.includes(moduleKey);
      return (prevFrozen && !canBeUnforzen) ? [...continueFozen, moduleKey] : continueFozen;
    }, []);

    
    if (!continueFozen.length) {
      const { frozenArchive: frozenArchiveNew, unfrozenModuleKeys } =  removeDependentFreezes(frozenArchive, moduleIds, previouslyFrozen);
      frozenArchive = frozenArchiveNew;
      resolve(unfrozenModuleKeys);
    } else {
      reject(continueFozen.map((moduleKey) => ({moduleKey, selfError: false})));
    }
  });
}

function updatefrozenArchiveonFailure(moduleIds, moduleErrors) {
  frozenArchive = moduleIds.reduce((frozenArchive, moduleKey) => {
    const moduleError = moduleErrors.find(({moduleKey: errorModuleKey}) => errorModuleKey === moduleKey);
    const frozen = moduleError && moduleError.selfError ? true : moduleError ? frozenArchive[moduleKey].frozen : false;
    const existingModuleDependencies = frozenArchive[moduleKey].dependentBreakModules;
    const newModuleDependencies = moduleIds.reduce((newModuleDependencies, errorModuleKey) => {
      return newModuleDependencies.includes(errorModuleKey) || errorModuleKey === moduleKey ? newModuleDependencies : [
        ...newModuleDependencies,
        errorModuleKey,
      ];
    }, existingModuleDependencies);
    return {
      ...frozenArchive,
      [moduleKey]: {
        frozen,
        dependentBreakModules: newModuleDependencies,
      }
    };
  }, frozenArchive);
  return moduleIds;
}

export function isModuleBrokenForState(moduleKey, version, state, passState) {
  const virtualVersion = realToVirtualVersion[moduleKey][version] || latestVirtualVersions[moduleKey];
  const failureVersions =  brokenInfo[moduleKey][state];
  const passVersions =  brokenInfo[moduleKey][passState];
  const fullPassVersions = brokenInfo[moduleKey][prStates.pass];

  const lastFailureBefore = [...failureVersions].reverse().find((failureVersion) => failureVersion <= virtualVersion);
  const isPassAfterFailure = lastFailureBefore ? [ ...passVersions ].reverse().find((passVersion) => passVersion > lastFailureBefore && passVersion <= virtualVersion) : undefined;
  const isFullPassAfterFailure = lastFailureBefore ? [ ...fullPassVersions ].reverse().find((passVersion) => passVersion > lastFailureBefore && passVersion <= virtualVersion) : undefined;

  return !!(lastFailureBefore && !isPassAfterFailure && !isFullPassAfterFailure);
}

function getTimeForModule(moduleKey, state, timingInfo) {
  if (moduleKey === bentoModule.key.toString()) {
    return timingInfo.bento[state];
  } else {
    return timingInfo.modules[moduleKey][state];
  }
}

function buildModule(moduleKey, timingInfo) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, getTimeForModule(moduleKey, moduleTimeStates.build, timingInfo) * 1000);
  });
}

function pushModule(moduleKey, timingInfo) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, getTimeForModule(moduleKey, moduleTimeStates.push, timingInfo) * 1000);
  });
}

function getShouldPass(state, failureState, moduleKey, version) {
  let pass = true;
  if (state === prStates.pass) {
    pass = true;
  } else if (state === failureState) {
    pass = false;
  } else if (state !== prStates.unchanged && state === failureState + 1) {
    pass = true;
  } else if (isModuleBrokenForState(moduleKey, version, failureState, failureState + 1)) {
    pass = false;
  }
  return pass;
}

function getShouldPassAll(prInfo, buildInfo, prState) {
  return Object.keys(allModules).reduce(({shouldPass, errorInfo}, moduleKey) => {
    const { state, version } = prInfo[moduleKey] || { state: prStates.unchanged, version: buildInfo[moduleKey] };
    const moduleShouldPass = getShouldPass(state, prState, moduleKey, version);
    return {
      shouldPass: shouldPass ? moduleShouldPass : false,
      errorInfo: moduleShouldPass ? errorInfo : [...errorInfo, {
        moduleKey,
        prInfo: prInfo[moduleKey],
      }],
    }
  }, {
    shouldPass: true,
    errorInfo: [],
  });
}

function testModule(moduleKey, timingInfo, { state, version }) {
  const shouldPass = getShouldPass(state, prStates.buildUTITFail, moduleKey, version);
  const fullTime =  (getTimeForModule(moduleKey, moduleTimeStates.ut, timingInfo) +  getTimeForModule(moduleKey, moduleTimeStates.it, timingInfo)) * (shouldPass ? 1 : Math.random());
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      return shouldPass ? resolve() : reject();
    }, fullTime * 1000);
  });
}

function getBentoBuildTime(timingInfo) {
  return getTimeForModule(bentoModule.key.toString(), moduleTimeStates.ut, timingInfo) +
    getTimeForModule(bentoModule.key.toString(), moduleTimeStates.it, timingInfo);
}

function createModulesInfo(prInfo, data, indexSelector) {
  const allModules = [bentoModule, ...modules];
  const changedModuleKeys = Object.keys(prInfo);
  return allModules.map(({ key, name }) => {
    const modulePRInfo = prInfo[key];
    const moduleKey = key.toString();
    return changedModuleKeys.includes(moduleKey) ? {
      ...(indexSelector ? data[indexSelector(moduleKey)] : data),
      key: moduleKey,
      text: modulePRInfo.version
    } : {
      key: moduleKey,
      unchanged: true,
    };
  });
}

function createModulesInfoForBuild(buildInfo, prInfo, data, indexSelector) {
  const allModules = [bentoModule, ...modules];
  const changedModuleKeys = Object.keys(prInfo);
  return allModules.map(({ key, name }) => {
    const moduleKey = key.toString();
    return {
      ...(indexSelector ? data[indexSelector(moduleKey)] : data),
      key: moduleKey,
      text: buildInfo[moduleKey],
      unchanged: !changedModuleKeys.includes(moduleKey),
    }
  });
}

function getIsModuleBlockedForRollout(moduleKey) {
  const { blocked, dependencyBlocked } = blockedRolloutInfo[moduleKey];
  return blocked || dependencyBlocked.length;
}

export class JenkinsBuild {
  constructor({
    changeInfo,
    addToQueue,
    setQueueInfoAtIndex,
    setModuleInfoAtIndex,
    setReleaseInfoAtIndex,
    updateE2EStatus,
    setModuleGS,
    addModulesForwarded,
    setModuleFrozen,
    setBentoBundleModuleFreeze,
    addModulesForwardedBentoBundle,
    addModulesForwardedRelease,
    addToReleaseQueue,
  }) {
    this.addToQueue = addToQueue;
    this.setQueueInfoAtIndex = setQueueInfoAtIndex;
    this.setModuleInfoAtIndex = setModuleInfoAtIndex;
    this.setReleaseInfoAtIndex = setReleaseInfoAtIndex;
    this.updateE2EStatus = updateE2EStatus;

    this.setModuleGS = setModuleGS;
    this.addModulesForwarded = addModulesForwarded;
    this.setModuleFrozen = setModuleFrozen;

    this.setBentoBundleModuleFreeze = setBentoBundleModuleFreeze;
    this.addModulesForwardedBentoBundle = addModulesForwardedBentoBundle;
    this.addModulesForwardedRelease = addModulesForwardedRelease;
    this.addToReleaseQueue = addToReleaseQueue;

    this.delayedStart(changeInfo);
  }

  removeVersionFromBroken(moduleInfo, version) {
    return Object.keys(moduleInfo).reduce((moduleInfo, failureState) => {
      const moduleFailureStateVersions = moduleInfo[failureState];
      const versionIndex = moduleFailureStateVersions.indexOf(version);
      return versionIndex === -1 ? moduleInfo : {
        ...moduleInfo,
        [failureState]: [...moduleFailureStateVersions.slice(0, versionIndex), ...moduleFailureStateVersions.slice(versionIndex + 1)],
      };
    }, moduleInfo);
  }

  addVersionFromBroken(moduleInfo, state, version) {
    return state === prStates.unchanged ? moduleInfo : {...moduleInfo, [state] : [...moduleInfo[state], version]};
  }

  updateBroken(prInfo) {
    brokenInfo = Object.keys(prInfo).reduce((brokenInfo, moduleKey) => {
      const {state, version} = prInfo[moduleKey];
      return {
        ...brokenInfo,
        [moduleKey]: this.addVersionFromBroken(brokenInfo[moduleKey], state, version),
      }
    }, brokenInfo);
  }

  updatestVertialVersions(prInfo) {
    latestVirtualVersions = Object.keys(prInfo).reduce(( latestVirtualVersions, moduleKey) => {
      const modulePRInfo = prInfo[moduleKey];
      return {
        ...latestVirtualVersions,
        [moduleKey]: modulePRInfo.state === prStates.unchanged ? latestVirtualVersions[moduleKey] : latestVirtualVersions[moduleKey] + 1,
      }
    }, latestVirtualVersions);
  }

  getPrInfoWithVirtualVersions(prInfo) {
    this.updatestVertialVersions(prInfo);
    return Object.keys(prInfo).reduce((prInfoWithVersions, moduleKey) => {
      const modulePRInfo = prInfo[moduleKey];
      return  modulePRInfo.state === prStates.unchanged ? prInfoWithVersions : {
        ...prInfoWithVersions,
        [moduleKey]: {
          ...modulePRInfo,
          version: latestVirtualVersions[moduleKey],
        },
      }
    }, {});
  }

  getPrInfoWithVersions(prInfo, mergeTimestamp) {
    return Object.keys(prInfo).reduce((prInfoWithVersions, moduleKey) => {
      const modulePRInfo = prInfo[moduleKey];
      return  modulePRInfo.state === prStates.unchanged ? prInfoWithVersions : {
        ...prInfoWithVersions,
        [moduleKey]: {
          ...modulePRInfo,
          version: moduleBuildScheduler.getVersion(moduleKey, mergeTimestamp),
        },
      }
    }, {});
  }

  modulesQueue(prInfo) {
    const waitTime = Math.ceil(Math.random() * 5);
    return new Promise((resolve) => {
      console.log('modulesQueue');
      this.index = this.addToQueue(pipelineState.module, {
        release: {
          state: 0,
          subState: 0,
        },
        modules: createModulesInfo(prInfo, {
          state: 1,
          subState: 1,
        }),
      });
      setTimeout(resolve, waitTime * 1000);
    });
  }

  bentoQueue(buildInfo, prInfo) {
    const waitTime = Math.ceil(Math.random() * 5);
    return new Promise((resolve, reject) => {
      console.log('bentoQueue');
      this.index = this.addToQueue(pipelineState.bento, {
        release: {
          state: 1,
          subState: 0,
          inProgress: false,
        },
        modules: createModulesInfoForBuild(buildInfo, prInfo, {
          state: 2,
          subState: 2,
          inProgress: false,
        }),
      });
      setTimeout(resolve, waitTime * 1000);
    });
  }

  releaseQueue(buildInfo, prInfo) {
    const waitTime = Math.ceil(Math.random() * 5);
    return new Promise((resolve, reject) => {
      console.log('releaseQueue');
      this.index = this.addToQueue(pipelineState.release, {
        release: {
          state: 2,
          subState: 0,
          inProgress: false,
        },
        modules: createModulesInfoForBuild(buildInfo, prInfo, {
          state: 2,
          subState: 2,
          inProgress: false,
        }),
      });
      setTimeout(resolve, waitTime * 1000);
    });
  }


  pushModule(moduleKey, timingInfo, version) {
    this.setModuleInfoAtIndex(pipelineState.module, this.index, moduleKey, {
      key: moduleKey,
      state: 2,
      subState: 1,
      inProgress: true,
      text: version,
    })
    return pushModule(moduleKey, timingInfo);
  }

  modulesBuild(prInfo, timingInfo) {
    return new Promise((resolve, reject) => {
      console.log('modulesBuild');
      this.setQueueInfoAtIndex(pipelineState.module, this.index, {
        release: {
          state: 0,
          subState: 0,
        },
        modules: createModulesInfo(prInfo, {
          state: 2,
          subState: 0,
          inProgress: true,
        }),
      });

      Promise.all(Object.keys(prInfo).map((moduleKey) => {
        return buildModule(moduleKey, timingInfo).then(() => {
          return this.pushModule(moduleKey, timingInfo, prInfo[moduleKey].version);
        });
      })).then(resolve);
    });
  }

  modulesTest(prInfo, timingInfo) {
    return new Promise((resolve, reject) => {
      console.log('modulesTest');
      this.setQueueInfoAtIndex(pipelineState.module,this.index, {
        release: {
          state: 0,
          subState: 0,
        },
        modules: createModulesInfo(prInfo, {
          state: 2,
          subState: 2,
          inProgress: true,
        }),
      });

      Promise.allSettled(Object.keys(prInfo).map((moduleKey) => {
        const moduleVersion = prInfo[moduleKey].version;
        return testModule(moduleKey, timingInfo, prInfo[moduleKey]).then(() => {
          const previousGS = moduleGSVersions[moduleKey];
          if (previousGS < moduleVersion) {
            this.setModuleGS(moduleKey, moduleVersion);
            setModuleGS(moduleKey, moduleVersion);
            // setModuleGSBlocked(moduleKey, moduleVersion);
          }
          this.setModuleInfoAtIndex(pipelineState.module, this.index, moduleKey, {
            key: moduleKey,
            state: 2,
            subState: 3,
            inProgress: false,
            text: moduleVersion,
          });
        }).catch(() => {
          this.setModuleInfoAtIndex(pipelineState.module, this.index, moduleKey, {
            key: moduleKey,
            state: 2,
            subState: 4,
            inProgress: false,
            text: moduleVersion,
          });
          throw new Error(JSON.stringify({moduleKey, prInfo: prInfo[moduleKey]}));
        });
      })).then((results) => {
        const { pass, failReasons } = results.reduce(({ failReasons, pass }, {status, reason}) => {
          return {
            pass: pass ? status === 'fulfilled' : false,
            failReasons: status === 'rejected' ? [...failReasons, reason] : failReasons,
          };
        }, {pass: true, failReasons: []});
        if (pass) {
          resolve();
        } else {
          reject(failReasons.map(({message}) => ({ ...JSON.parse(message), selfError: true })));
        }
      });
    });
  }

  bentoBuild(buildInfo, prInfo, timingInfo) {
    return new Promise((resolve, reject) => {
      console.log('bentoBuild');
      this.setQueueInfoAtIndex(pipelineState.bento, this.index, {
        release: {
          state: 1,
          subState: 0,
          inProgress: true,
        },
        modules: createModulesInfoForBuild(buildInfo, prInfo, {
          state: 2,
          subState: 2,
          inProgress: false,
        }),
      });

      setTimeout(() => {
        this.setReleaseInfoAtIndex(pipelineState.bento, this.index, {
          state: 1,
          subState: 0,
          inProgress: false,
        });
        resolve();
      }, getTimeForModule(bentoModule.key.toString(), bentoTimeStates.build, timingInfo) * 1000);
    });
  }

  bentoTest(buildInfo, prInfo, timingInfo) {
    return new Promise((resolve, reject) => {
      console.log('bentoTest')
      this.setQueueInfoAtIndex(pipelineState.bento, this.index, {
        release: {
          state: 1,
          subState: 1,
          inProgress: true,
        },
        modules: createModulesInfoForBuild(buildInfo, prInfo, {
          state: 2,
          subState: 2,
          inProgress: false,
        }),
      });

      const { shouldPass, errorInfo } = getShouldPassAll(prInfo, buildInfo, prStates.fullBuildUTITFail);
      setTimeout(() => {
        if (shouldPass) {
          this.setReleaseInfoAtIndex(pipelineState.bento, this.index, {
            state: 1,
            subState: 2,
            inProgress: false,
          });
          resolve(buildInfo);
        } else {
          const moduleInfoData = [
            {
              state: 2,
              subState: 3,
              inProgress: false,
            },
            {
              state: 2,
              subState: 4,
              inProgress: false,
            }
          ];

          const modulesInfo = createModulesInfoForBuild(buildInfo, prInfo, moduleInfoData, (function (errorInfo, moduleKey) {
            const errorState = errorInfo.find(({moduleKey: errorModuleKey}) => errorModuleKey === moduleKey);
            return errorState ? 1 : 0;
          }).bind(this, errorInfo));
          this.setQueueInfoAtIndex(pipelineState.bento, this.index, {
            release: {
              state: 1,
              subState: 3,
              inProgress: false,
            },
            modules: modulesInfo,
          });
          reject(errorInfo.map((ei) => ({...ei, selfError: true})));
        }
      }, getBentoBuildTime(timingInfo) * 1000 * (shouldPass ? 1 : Math.random()));
    });
  }

  forwardPR(unfrozenModuleKeys, prInfo) {
    return new Promise((resolve) => {
      const forwardedInfo = allModules.reduce((forwardedInfo, { key: moduleKey }) => {
        const modulePRInfo = prInfo[moduleKey];
        const shouldTakeLatestGS = unfrozenModuleKeys.includes(moduleKey) && !getIsModuleBlockedForRollout(moduleKey);
        return {
          ...forwardedInfo,
          [moduleKey]: modulePRInfo ? modulePRInfo.version : shouldTakeLatestGS ? moduleGSVersions[moduleKey] : previousModuleGSVersions[moduleKey]
        };
      }, {});
      this.addModulesForwarded(forwardedInfo);
      setAllPreviousModuleGSVersions(forwardedInfo);
      resolve(forwardedInfo);
    });
  }

  freezeModules(frozenModuleKeys, state) {
    frozenModuleKeys.forEach((moduleKey ) => {
      this.setModuleFrozen(moduleKey, state);
    });
  }

  unfreezeAllBentoBundle() {
    allModules.forEach(({ key }) => {
      this.setBentoBundleModuleFreeze(key.toString(), false);
    });
  }

  freezeBentoBundle(prInfo) {
    Object.keys(prInfo).forEach((moduleKey) => {
      this.setBentoBundleModuleFreeze(moduleKey, true);
    });
  }

  startRelease(buildInfo, prInfo, timingInfo) {
    this.addToReleaseQueue(buildInfo);
    const releaseAdded = addToRelease(buildInfo, prInfo, timingInfo);
    if (releaseInProgress) {
      releaseThrottled = releaseThrottled || releaseAdded;
    } else {
      releaseInProgress = true
      return new Promise((resolve, reject) => {
        this.releaseQueue(buildInfo, prInfo);
        resolve(buildInfo)
      }).then((buildInfo) => {
        return this.deployToLongE2E(buildInfo, prInfo, timingInfo);
      }).then((buildInfo) => {
        this.updateE2EStatus('passing');
        this.addModulesForwardedRelease(buildInfo);
      }).catch(({message}) => {
        if (message !== 'no_bento_gs') {
          this.updateE2EStatus('failing');
        }
      }).finally(() => {
        releaseInProgress = false;
        if (releaseThrottled) {
          releaseThrottled = false;
          const { prInfo, buildInfo, timingInfo } = releases[releases.length - 1];
          this.startRelease(buildInfo, prInfo, timingInfo);
        }
      });
    }
  }

  deployToLongE2E(buildInfo, prInfo, timingInfo) {
    return new Promise((resolve, reject) => {
      console.log('deployToLongE2E')
      this.setQueueInfoAtIndex(pipelineState.release, this.index, {
        release: {
          state: 2,
          subState: 0,
          inProgress: true,
        },
        modules: createModulesInfoForBuild(buildInfo, prInfo, {
          state: 2,
          subState: 2,
          inProgress: false,
        }),
      });

      setTimeout(() => {
        this.setQueueInfoAtIndex(pipelineState.release, this.index, {
          release: {
            state: 2,
            subState: 1,
            inProgress: true,
          },
          modules: createModulesInfoForBuild(buildInfo, prInfo, {
            state: 2,
            subState: 2,
            inProgress: false,
          }),
        });  

        const { shouldPass, errorInfo } = getShouldPassAll(prInfo, buildInfo, prStates.e2eFail);
        setTimeout(() => {
          if (shouldPass) {
            this.setQueueInfoAtIndex(pipelineState.release, this.index, {
              release: {
                state: 2,
                subState: 2,
                inProgress: false,
              },
              modules: createModulesInfoForBuild(buildInfo, prInfo, {
                state: 2,
                subState: 2,
                inProgress: false,
              }),
            });  
            resolve(buildInfo);
          } else {
            const moduleInfoData = [
              {
                state: 2,
                subState: 3,
                inProgress: false,
              },
              {
                state: 2,
                subState: 4,
                inProgress: false,
              }
            ];
  
            const modulesInfo = createModulesInfoForBuild(buildInfo, prInfo, moduleInfoData, (function (errorInfo, moduleKey) {
              const errorState = errorInfo.find(({moduleKey: errorModuleKey}) => errorModuleKey === moduleKey);
              return errorState ? 1 : 0;
            }).bind(this, errorInfo));
            this.setQueueInfoAtIndex(pipelineState.release, this.index, {
              release: {
                state: 2,
                subState: 3,
                inProgress: false,
              },
              modules: modulesInfo,
            });
            reject(errorInfo);
          }
        }, getTimeForModule(bentoModule.key.toString(), bentoTimeStates.e2e, timingInfo) * 1000 * (shouldPass ? 1 : Math.random()));
      }, Math.random() * 5000);
    });
  }

  throwIfBlocedForRollout(prInfo) {
    const blockedForRollout = this.calculateAndSetBlockedRollout(prInfo)
    return new Promise((resolve, reject) => {
      if (blockedForRollout) {
        reject({message: 'blocked_from_rollout'});
      } else {
        resolve();
      }
    });
  }

  calculateAndSetBlockedRollout(prInfo) {
    const isPRBlockedForRollout = Object.keys(prInfo).some((moduleKey) => getIsModuleBlockedForRollout(moduleKey));
    if (isPRBlockedForRollout) {
      blockedRolloutInfo = Object.keys(prInfo).reduce((blockedRolloutInfo, moduleKey) => {
        const dependencyBlocked = Object.keys(prInfo).reduce((dependencyBlocked, dependencyModuleKey) => {
          return moduleKey === dependencyModuleKey || dependencyBlocked.includes(dependencyModuleKey) ? dependencyBlocked : [
            ...dependencyBlocked,
            dependencyModuleKey,
          ];
        }, [ ...blockedRolloutInfo[moduleKey].dependencyBlocked ]);
        return {
          ...blockedRolloutInfo,
          [moduleKey]: {
            blocked: blockedRolloutInfo[moduleKey].blocked,
            dependencyBlocked,
          },
        };
      }, { ...blockedRolloutInfo });
      Object.keys(blockedRolloutInfo).forEach((moduleKey) => {
        wrapperSetBlockRolloutModuleState(moduleKey, blockedRolloutInfo[moduleKey]);
      });
    }
    console.log(blockedRolloutInfo, this.index);
    return isPRBlockedForRollout;
  }

  build(prInfo, timingInfo) {
    this.modulesQueue(prInfo).then(() => {
      return this.modulesBuild(prInfo, timingInfo);
    }).then(() => {
      return this.modulesTest(prInfo, timingInfo)
    }).then(() => {
      return moduleBuildScheduler.scheduleModuleResult(prInfo).then(() => {
        return updatefrozenArchiveonSuccess(Object.keys(prInfo)).then((unfrozenModuleKeys) => {
          this.freezeModules(unfrozenModuleKeys, false);
          return this.throwIfBlocedForRollout(prInfo).then(() => unfrozenModuleKeys);
        });
      }).then((unfrozenModuleKeys) => this.forwardPR(unfrozenModuleKeys, prInfo));
    }).catch((errors) => {
      return moduleBuildScheduler.scheduleModuleResult(prInfo).then(() => {
        if (errors.message !== 'blocked_from_rollout') {
            const frozenModuleKeys = updatefrozenArchiveonFailure(Object.keys(prInfo), errors);
            this.freezeModules(frozenModuleKeys, true);
        }
        moduleBuildScheduler.finishResultProcessing(prInfo);
        return Promise.reject({message: 'no_module_gs'});
      });
    }).then((buildInfo) => {
      moduleBuildScheduler.finishResultProcessing(prInfo);
      this.bentoQueue(buildInfo, prInfo);
      return buildInfo;
    })
    .then((buildInfo) => {
      return this.bentoBuild(buildInfo, prInfo, timingInfo).then(() => buildInfo);
    }).then((buildInfo) => {
      return this.bentoTest(buildInfo, prInfo, timingInfo);
    }).then((buildInfo) => {
      this.unfreezeAllBentoBundle();
      this.addModulesForwardedBentoBundle(buildInfo);
      return buildInfo;
    }).catch(({ message }) => {
      if (message !== 'no_module_gs') {
        this.freezeBentoBundle(prInfo);
      }
      throw new Error('no_bento_gs');
    }).then((buildInfo) => {
      return this.startRelease(buildInfo, prInfo, timingInfo);
    });
  }

  delayedStart({prInfo, timingInfo}) {
    const mergeTimestamp = Date.now();
    const prInfoWithVirtualVersions = this.getPrInfoWithVirtualVersions(prInfo, mergeTimestamp);
    this.updateBroken(prInfoWithVirtualVersions);

    const delayTime = Math.random() * 5000;

    setTimeout(() => {
      this.startBuild({prInfo, timingInfo}, mergeTimestamp, prInfoWithVirtualVersions);
    }, delayTime);
  }

  startBuild({prInfo, timingInfo}, mergeTimestamp, prInfoWithVirtualVersions) {
    const prInfoWithVersions = this.getPrInfoWithVersions(prInfo, mergeTimestamp);
    createRealToVirtualVersionMap(prInfoWithVersions, prInfoWithVirtualVersions);
    this.build(prInfoWithVersions, timingInfo);
  }
}
