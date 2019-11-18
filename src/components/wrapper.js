import React from 'react';
import { ReleaseQueue } from './releaseQueue/releaseQueue';
import { PipelineGenerator } from './pipelineGenerator/pipelineGenerator';
import { ReleaseState } from './releaseState/releaseState';
import { modules, bentoModule } from './pipelineGenerator/pipelineGenerator';
import { JenkinsBuild, initialize, setBlockRollout as jenkinsBuildSetBlockRolloutState } from '../helpers/jenkinsBuild';
import './wrapper.scss';

export const pipelineState = {
  module: 0,
  bento: 1,
  release: 2,
};

export class Wrapper extends React.Component {
  constructor() {
    super();
    this.state = {
      releaseQueue: [],
      blockRollout: [...modules, bentoModule].reduce((versionsInfo, { key }) => ({ ...versionsInfo, [key]: {
        blocked: (key === 0 ? true : false),
        dependencyBlocked: [],
      }}), {}),
      gsVersionss: {
        modules: {
          gs: [...modules, bentoModule].reduce((versionsInfo, {key}) => ({ ...versionsInfo, [key]: 0}), {}),
          frozen: [...modules, bentoModule].reduce((versionsInfo, {key}) => ({ ...versionsInfo, [key]: false}), {}),
          forwardedVersions: [[...modules, bentoModule].reduce((versionsInfo, {key}) => ({ ...versionsInfo, [key]: 0}), {})],
        },
        bentoBundle: {
          frozen: [...modules, bentoModule].reduce((versionsInfo, {key}) => ({ ...versionsInfo, [key]: false}), {}),
          forwardedVersions: [[...modules, bentoModule].reduce((versionsInfo, {key}) => ({ ...versionsInfo, [key]: 0}), {})],
        },
        release: {
          forwardedVersions: [[...modules, bentoModule].reduce((versionsInfo, {key}) => ({ ...versionsInfo, [key]: 0}), {})],
          e2eStatus: 'passing',
        },
      },
      gsVersions: [...modules, bentoModule].reduce((versionsInfo, {key}) => ({ ...versionsInfo, [key]: { version: 0, frozen: false }}), {}),
      pipelineData: {
        [pipelineState.module]: {
          frozen: [],
          modulesInfo: [
            ...modules,
            {
              key: 0,
              name: 'Bento'
            },
          ],
          queueInfo: [],
        },
        [pipelineState.bento]: {
          frozen: [],
          modulesInfo: [
            ...modules,
            {
              key: 0,
              name: 'Bento'
            },
          ],
          queueInfo: [],
        },
        [pipelineState.release]: {
          frozen: [],
          modulesInfo: [
            ...modules,
            {
              key: 0,
              name: 'Bento'
            },
          ],
          queueInfo: [],
        }
      },
    };
    this.setQueueInfoAtIndex = this.setQueueInfoAtIndex.bind(this);
    this.setModuleInfoAtIndex = this.setModuleInfoAtIndex.bind(this);
    this.setReleaseInfoAtIndex = this.setReleaseInfoAtIndex.bind(this);
    this.setFrozen = this.setFrozen.bind(this);
    this.buildChange = this.buildChange.bind(this);
    this.updateE2EStatus = this.updateE2EStatus.bind(this);
    this.setModuleGS = this.setModuleGS.bind(this);
    this.addModulesForwarded = this.addModulesForwarded.bind(this);
    this.setModuleFrozen = this.setModuleFrozen.bind(this),
    this.setBentoBundleModuleFreeze = this.setBentoBundleModuleFreeze.bind(this);
    this.addModulesForwardedBentoBundle = this.addModulesForwardedBentoBundle.bind(this);
    this.addModulesForwardedRelease = this.addModulesForwardedRelease.bind(this);
    this.setBlockRollout = this.setBlockRollout.bind(this);
    this.setBlockRolloutState = this.setBlockRolloutState.bind(this);
    this.addToQueue = this.addToQueue.bind(this);
    this.addToReleaseQueue = this.addToReleaseQueue.bind(this);
  }

  componentDidMount() {
    initialize(this.setBlockRolloutState);
  }

  setModuleGS(moduleKey, gsVersion) {
    const { gsVersionss} = this.state;
    const { modules }  = gsVersionss;
    const { gs } = modules;
    this.setState({
      gsVersionss: {
        ...gsVersionss,
        modules: {
          ...modules,
          gs: {
            ...gs,
            [moduleKey]: gsVersion
          }
        },
      },
    });
  }

  setModuleFrozen(moduleKey, frozenState) {
    const { gsVersionss} = this.state;
    const { modules }  = gsVersionss;
    const { frozen } = modules;
    this.setState({
      gsVersionss: {
        ...gsVersionss,
        modules: {
          ...modules,
          frozen: {
            ...frozen,
            [moduleKey]: frozenState,
          }
        },
      },
    });
  }

  addModulesForwarded(forwardedVersion) {
    const { gsVersionss} = this.state;
    const { modules }  = gsVersionss;
    const { forwardedVersions } = modules;
    this.setState({
      gsVersionss: {
        ...gsVersionss,
        modules: {
          ...modules,
          forwardedVersions: [
            ...forwardedVersions,
            {
              ...forwardedVersions[forwardedVersions.length - 1],
              ...forwardedVersion,
            },
          ]
        },
      },
    });
  }

  setBentoBundleModuleFreeze(moduleKey, status) {
    const { gsVersionss} = this.state;
    const { bentoBundle }  = gsVersionss;
    const { frozen } = bentoBundle;

    this.setState({
      gsVersionss: {
        ...gsVersionss,
        bentoBundle: {
          ...bentoBundle,
          frozen: {
            ...frozen,
            [moduleKey]: status,
          },
        },
      },
    });
  }

  addModulesForwardedBentoBundle(forwardedVersion) {
    const { gsVersionss} = this.state;
    const { bentoBundle }  = gsVersionss;
    const { forwardedVersions } = bentoBundle;
    this.setState({
      gsVersionss: {
        ...gsVersionss,
        bentoBundle: {
          ...bentoBundle,
          forwardedVersions: [
            ...forwardedVersions,
            forwardedVersion,
          ]
        },
      },
    });
  }

  addModulesForwardedRelease(forwardedVersion) {
    const { gsVersionss} = this.state;
    const { release }  = gsVersionss;
    const { forwardedVersions } = release;
    this.setState({
      gsVersionss: {
        ...gsVersionss,
        release: {
          ...release,
          forwardedVersions: [
            ...forwardedVersions,
            forwardedVersion,
          ]
        },
      },
    });
  }

  updateE2EStatus(status) {
    console.log('here', status);
    const { gsVersionss} = this.state;
    const { release }  = gsVersionss;
    this.setState({
      gsVersionss: {
        ...gsVersionss,
        release: {
          ...release,
          e2eStatus: status,
        },
      },
    });
  }

  addToQueue(queueState, data) {
    const { modulesInfo, queueInfo } = this.state.pipelineData[queueState];
    const index = queueInfo.length;
    this.setState({
      pipelineData: {
        ...this.state.pipelineData,
        [queueState]: {
          modulesInfo,
          queueInfo: [
            ...queueInfo,
            data,
          ],
        }
      }
    });
    return index;
  }

  addToReleaseQueue(buildInfo) {
    this.setState({
      releaseQueue: [
        ...this.state.releaseQueue,
        buildInfo,
      ],
    });
  }

  setQueueInfoAtIndex(pipelineState, index, data ) {
    const { modulesInfo, queueInfo } = this.state.pipelineData[pipelineState];
    this.setState({
      pipelineData: {
        ...this.state.pipelineData,
        [pipelineState]: {
          modulesInfo,
          queueInfo: [
            ...queueInfo.slice(0, index),
            data,
            ...queueInfo.slice(index + 1),
          ],
        }
      }
    });
  }

  setModuleInfoAtIndex(pipelineState, index, moduleKey, data) {
    const { modulesInfo, queueInfo } = this.state.pipelineData[pipelineState];
    this.setState({
      pipelineData: {
        ...this.state.pipelineData,
        [pipelineState]: {
          modulesInfo,
          queueInfo: [
            ...queueInfo.slice(0, index),
            {
              ...queueInfo[index],
              modules: [
                ...queueInfo[index].modules.filter(({key}) => key !== moduleKey),
                data,
              ]
            },
            ...queueInfo.slice(index + 1),
          ],
        },
      }
    });
  }

  setReleaseInfoAtIndex(pipelineState, index, data) {
    const { modulesInfo, queueInfo } = this.state.pipelineData[pipelineState];
    this.setState({
      pipelineData: {
        ...this.state.pipelineData,
        [pipelineState]: {
          modulesInfo,
          queueInfo: [
            ...queueInfo.slice(0, index),
            {
              ...queueInfo[index],
              release: data,
            },
            ...queueInfo.slice(index + 1),
          ],
        },
      }
    });
  }

  setFrozen(moduleKey) {
    const { frozen, modulesInfo, queueInfo } = this.state.pipelineData[pipelineState.module];
    this.setState({
      pipelineData: {
        ...this.state.pipelineData,
          [pipelineState.module]: {
          frozen: frozen.includes(moduleKey) ? frozen : [...frozen, moduleKey],
          modulesInfo,
          queueInfo,
        },
      }
    });
  }

  setBlockRolloutState(moduleKey, state) {
    this.setState((wrapperState) => ({
      blockRollout: {
        ...wrapperState.blockRollout,
        [moduleKey]: {
          ...wrapperState.blockRollout[moduleKey],
          ...state,
        },
      },
    }));
  }

  setBlockRollout(moduleKey, state) {
    jenkinsBuildSetBlockRolloutState(moduleKey, state);
  }

  buildChange(changeInfo) {
    new JenkinsBuild({
      changeInfo,
      index: this.state.pipelineData[pipelineState.module].queueInfo.length,
      addToQueue: this.addToQueue,
      setQueueInfoAtIndex: this.setQueueInfoAtIndex,
      setModuleInfoAtIndex: this.setModuleInfoAtIndex,
      setReleaseInfoAtIndex: this.setReleaseInfoAtIndex,
      updateE2EStatus: this.updateE2EStatus,
      // ---------------
      setModuleGS: this.setModuleGS,
      addModulesForwarded: this.addModulesForwarded,
      setModuleFrozen: this.setModuleFrozen,
      //----------------
      setBentoBundleModuleFreeze: this.setBentoBundleModuleFreeze,
      addModulesForwardedBentoBundle: this.addModulesForwardedBentoBundle,
      //----------------
      addModulesForwardedRelease: this.addModulesForwardedRelease,
      // ---------------
      addToReleaseQueue: this.addToReleaseQueue,
    });
  }

  render() {
    const { gs: gsVersions, frozen: frozenInfo, forwardedVersions: forwardedInfo } = this.state.gsVersionss.modules;
    const { frozen: frozenInfoBentoBundle, forwardedVersions: forwardedInfoBentoBundle } = this.state.gsVersionss.bentoBundle;
    const { forwardedVersions: forwardedInfoRelease, e2eStatus } = this.state.gsVersionss.release;
    return <div>
      <div className='release-queue-state-wrapper'>
        <h2>Module Build</h2>
        <div className='section-wrapper'>
          <ReleaseQueue data={this.state.pipelineData[pipelineState.module]} />
          <ReleaseState gsVersions={gsVersions} frozenInfo={frozenInfo} forwardedInfo={forwardedInfo} blockedRolloutInfo={this.state.blockRollout}/>
        </div>
      </div>
      <div className='release-queue-state-wrapper parallel-container'>
        <div className='release-queue-state-wrapper'>
          <h2>Bento Build</h2>
          <div className='section-wrapper'>
            <ReleaseQueue data={this.state.pipelineData[pipelineState.bento]} />
            <ReleaseState frozenInfo={frozenInfoBentoBundle} forwardedInfo={forwardedInfoBentoBundle} />
          </div>
        </div>
        <div className='release-queue-state-wrapper'>
          <h2>Stag Build</h2>
          <div className='section-wrapper'>
            <ReleaseQueue data={this.state.pipelineData[pipelineState.release]} throttleQueue={this.state.releaseQueue}/>
            <ReleaseState forwardedInfo={forwardedInfoRelease} e2eStatus={e2eStatus} />
          </div>
        </div>
      </div>
      <PipelineGenerator build={this.buildChange} blockRolloutState={this.state.blockRollout} setBlockRollout={this.setBlockRollout}/>
    </div>
  }
}
