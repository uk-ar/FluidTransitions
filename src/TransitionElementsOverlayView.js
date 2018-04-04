import React from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import PropTypes from 'prop-types';

import TransitionItem from './TransitionItem';
import { createAnimatedWrapper, createAnimated, mergeStyles, getRotationFromStyle } from './Utils';
import { 
  TransitionContext, 
  RouteDirection, 
  NavigationDirection, 
  TransitionSpecification 
} from './Types';
import {
  getScaleTransition,
  getTopTransition,
  getBottomTransition,
  getLeftTransition,
  getRightTransition,
  getHorizontalTransition,
  getVerticalTransition,
  getFlipTransition,
}
  from './Transitions';

import * as Constants from './TransitionConstants';

const styles: StyleSheet.NamedStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  transitionElement: {
    position: 'absolute',
    // backgroundColor: '#00FF0022',
    margin: 0,
  },
});

type TransitionEntry = {
  name: string,
  transitionFunction: Function
}

const transitionTypes: Array<TransitionEntry> = [];

// This function can be called to register other transition functions
export function registerTransitionType(name: string, transitionFunction: Function): TransitionEntry {
  transitionTypes.push({ name, transitionFunction });
}

registerTransitionType('scale', getScaleTransition);
registerTransitionType('top', getTopTransition);
registerTransitionType('bottom', getBottomTransition);
registerTransitionType('left', getLeftTransition);
registerTransitionType('right', getRightTransition);
registerTransitionType('horizontal', getHorizontalTransition);
registerTransitionType('vertical', getVerticalTransition);
registerTransitionType('flip', getFlipTransition);

type TransitionElementsOverlayViewProps = {
  fromRoute: string,
  toRoute: string,
  direction: number,
  transitionElements: Array<any>
}

class TransitionElementsOverlayView extends React.Component<TransitionElementsOverlayViewProps> {
  context: TransitionContext
  constructor(props: TransitionElementsOverlayViewProps, context: TransitionContext) {
    super(props, context);
    this._isMounted = false;
  }

  _isMounted: boolean;
  _transitionElements: Array<TransitionItem>

  shouldComponentUpdate(nextProps) {
    if (!nextProps.fromRoute && !nextProps.toRoute) { return false; }

    // Compare toRoute/fromRoute/direction
    if (this.props.toRoute !== nextProps.toRoute ||
      this.props.fromRoute !== nextProps.fromRoute ||
      this.props.direction !== nextProps.direction) { return true; }

    // Compare elements
    if (!this.compareArrays(this.props.transitionElements, nextProps.transitionElements)) { return true; }

    return false;
  }

  compareArrays(a, b) {
    if (!a && !b) return false;
    if (!a && b || !b && a) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].name !== b[i].name ||
        a[i].route !== b[i].route) { return false; }
    }
    return true;
  }

  render() {
    const { getDirectionForRoute, getDirection } = this.context;
    if (!this.props.transitionElements || !this.getMetricsReady() ||
      !getDirectionForRoute || !getDirection) {
      // console.log("RENDER TE empty");
      return <View style={styles.overlay} pointerEvents="none" />;
    }

    // console.log("RENDER TE " + this.props.transitionElements.length);
    const transitionElements = this.props.transitionElements
      .filter(i => i.route === this.props.fromRoute || i.route === this.props.toRoute);

    const delayCountFrom = transitionElements
      .filter(item => getDirectionForRoute(item.name, item.route) === RouteDirection.from)
      .reduce((prevValue, item) => (item.delay ? prevValue + 1 : prevValue), 0);

    const delayCountTo = transitionElements
      .filter(item => getDirectionForRoute(item.name, item.route) === RouteDirection.to)
      .reduce((prevValue, item) => (item.delay ? prevValue + 1 : prevValue), 0);

    const navDirection = getDirection();
    let delayIndexFrom = 0;
    let delayIndexTo = Math.max(0, delayCountTo - 1);
    const delayFromFactor = 1;
    const delayToFactor = -1;

    const transitionViews = transitionElements.map((item, idx) => {
      const routeDirection = getDirectionForRoute(item.name, item.route);  
      const element = React.Children.only(item.reactElement.props.children);
      const key = "TransitionOverlay-"  + idx.toString();
      const transitionStyle = this.getPositionStyle(
        item, routeDirection === RouteDirection.from ?
          delayCountFrom + 1 : delayCountTo + 1,
        routeDirection === RouteDirection.from ?
          delayIndexFrom : delayIndexTo,
      );
      const rotationInfo = getRotationFromStyle(element.props.style);
      if(rotationInfo.rotate) {
        const transform = transitionStyle.transform ? transitionStyle.transform : [];
        transform.push({ rotate: new Animated.Value(0).interpolate({
          inputRange: [0, 1],
          outputRange: [rotationInfo.rotate.rotate, '0deg']
        })});
        transitionStyle.transform = transform;
      }

      const style = [transitionStyle, styles.transitionElement];
      const comp =  createAnimatedWrapper(element, key, style);

      if (item.delay) {
        if (routeDirection === RouteDirection.from) {
          delayIndexFrom += delayFromFactor;
        } else {
          delayIndexTo += delayToFactor;
        }
      }
      return comp;
    });

    return (
      <View style={styles.overlay} pointerEvents="none">
        {transitionViews}
      </View>
    );
  }

  getPositionStyle(item: TransitionItem, delayCount: number, delayIndex: number) {
    return {
      left: item.metrics.x,
      top: item.metrics.y,
      width: item.metrics.width,
      height: item.metrics.height, 
      ...this.getTransitionStyle(item, delayCount, delayIndex)
    };
  }

  getTransitionStyle(item: TransitionItem, delayCount: number, delayIndex: number) {
    const { getTransitionProgress, getDirectionForRoute,
      getIndex, getDirection } = this.context;

    if (!getTransitionProgress || !getDirectionForRoute ||
      !getIndex || !getDirection) { return {}; }

    const index = getIndex();
    const direction = getDirection();
    const routeDirection = getDirectionForRoute(item.name, item.route);
    const progress = getTransitionProgress();
    
    if (progress) {
      const transitionFunction = this.getTransitionFunction(item, routeDirection);
      if (transitionFunction) {
        // Calculate start/end to handle delayed transitions
        let start = Constants.TRANSITION_PROGRESS_START;
        let end = Constants.TRANSITION_PROGRESS_END;

        const distance = (1.0 - (Constants.TRANSITION_PROGRESS_START +
          (1.0 - Constants.TRANSITION_PROGRESS_END))) * 0.5;

        if (item.delay) {
          // Start/stop in delay window
          const delayStep = distance / delayCount;
          if (routeDirection === RouteDirection.from) {
            start += (delayStep * delayIndex);
          } else {
            end -= (delayStep * delayIndex);
          }
        } else {
          // Start/stop first/last half of transition
          if (routeDirection === RouteDirection.from) {
            end -= distance;
          } else {
            start += distance;
          }
        }

        // Create progress interpolation
        const interpolatedProgress = progress.interpolate({
          inputRange: direction === NavigationDirection.forward ? [index - 1, index] : [index, index + 1],
          outputRange: [0, 1],
        });

        const transitionSpecification: TransitionSpecification = {
          progress: interpolatedProgress,
          name: item.name,
          route: item.route,
          metrics: item.metrics,
          direction: routeDirection,
          dimensions: Dimensions.get('window'),
          start,
          end,
        };

        return transitionFunction(transitionSpecification);
      }
    }
    return { };
  }

  getTransitionFunction(item: TransitionItem, routeDirection: RouteDirection) {
    const getTransition = (transition: string | Function) => {
      if (transition instanceof Function) { return transition; }
      const transitionType = transitionTypes.find(e => e.name === transition);
      if (transitionType) return transitionType.transitionFunction;
    };

    if (routeDirection === RouteDirection.to && item.appear) {
      return getTransition(item.appear);
    } else if (routeDirection === RouteDirection.from && item.disappear) {
      return getTransition(item.disappear);
    } else if (item.appear) {
      return getTransition(item.appear);
    }
    return null;
  }

  getMetricsReady(): boolean {
    if (this.props.transitionElements) {
      let metricsReady = true;
      this.props.transitionElements.forEach(item => {
        if (!item.metrics) { metricsReady = false; }
      });
      return metricsReady;
    }
    return false;
  }

  componentDidMount() {
    this._isMounted = true;
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  static contextTypes = {
    getTransitionProgress: PropTypes.func,
    getDirectionForRoute: PropTypes.func,
    getDirection: PropTypes.func,
    getIndex: PropTypes.func,
  }
}

export default TransitionElementsOverlayView;
