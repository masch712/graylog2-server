import React from 'react';
import PropTypes from 'prop-types';

import crossfilter from 'crossfilter';
import dc from 'dc';
import d3 from 'd3';
import _ from 'lodash';
import Immutable from 'immutable';
import deepEqual from 'deep-equal';
import naturalSort from 'javascript-natural-sort';
import graphHelper from 'legacy/graphHelper';

import D3Utils from 'util/D3Utils';

/*
 * A stacked bar chart visualization to draw QuickValues over time based on dc.js.
 */
const QuickValuesHistogramVisualization = React.createClass({
  DEFAULT_CONFIG: {
    limit: 5,
    sort_order: 'desc',
  },
  DEFAULT_HEIGHT: 220,

  // dc.js is modifying the margins passed into the graph so make sure this is immutable
  CHART_MARGINS: Immutable.fromJS({ left: 50, right: 15, top: 10, bottom: 35 }),

  propTypes: {
    id: PropTypes.string.isRequired,
    config: PropTypes.shape({
      limit: PropTypes.number,
      sort_order: PropTypes.oneOf(['asc', 'desc']),
      field: PropTypes.string.isRequired,
    }),
    data: PropTypes.object,
    width: PropTypes.number,
    height: PropTypes.number,
  },

  _chartRef: undefined,
  _chart: undefined,
  _crossfilter: undefined,

  getDefaultProps() {
    return {
      config: this.DEFAULT_CONFIG,
      width: undefined,
      height: this.DEFAULT_HEIGHT,
      data: undefined,
    };
  },

  getInitialState() {
    this._crossfilter = crossfilter();

    return {
      data: this._formatData(this.props.data),
      timerange: this._getQueriedTimerange(this.props.data),
      interval: this._getInterval(this.props.data),
      limit: this.props.config.limit,
      sortOrder: this.props.config.sort_order,
      width: this.props.width,
      height: this.props.height,
    };
  },

  componentDidMount() {
    this._renderChart();
    // Resize the chart after rendering it to get the actual width and height of the container
    this._resizeChart(this._chartRef.clientWidth, this._chartRef.clientHeight);
  },

  componentWillReceiveProps(nextProps) {
    if (deepEqual(this.props, nextProps)) {
      return;
    }

    if (nextProps.height !== this.props.height || nextProps.width !== this.props.width) {
      this._resizeChart(nextProps.width, nextProps.height);
    }

    if (nextProps.data) {
      this._updateData(nextProps);
    }
  },

  _updateData({ data, config, width, height }) {
    this.setState({
      data: this._formatData(data),
      timerange: this._getQueriedTimerange(data),
      interval: this._getInterval(data),
      limit: config.limit,
      sortOrder: config.sort_order,
      width: width || this._chartRef.clientWidth,
      height: height || this._chartRef.clientHeight || this.DEFAULT_HEIGHT,
    }, this._redrawChart);
  },

  _getInterval(data) {
    return (data.interval || 'day').toLowerCase();
  },

  _getQueriedTimerange(data) {
    // The histogram response contains a "queried_timerange" object:
    //
    // queried_timerange: {
    //   from: "2017-09-28T18:23:41.264Z",
    //   to: "2017-10-10T09:57:01.264Z"
    // }
    return {
      from: new Date(data.queried_timerange.from),
      to: new Date(data.queried_timerange.to),
    };
  },

  _formatData(data) {
    // Formats data from the termsHistogram API response (left) to a structure suitable for the chart (right).
    //
    // {                           [
    //   buckets: {                  {
    //     1507075200: {               key: new Date(1507075200 * 1000),
    //       terms: {                  terms: [
    //         a: 11,                    { term: 'a', count: 11 },
    //         b: 10                     { term: 'b', count: 10 }
    //       }                         ]
    //     }                         }
    //   }                         ]
    // }
    //
    return _.reduce(data.buckets, (result, bucket, timestamp) => {
      const terms = _.reduce(bucket.terms, (termResult, count, term) => {
        termResult.push({ term: term, count: count });
        return termResult;
      }, []).sort((a, b) => naturalSort(b.count, a.count));

      result.push({
        key: new Date(timestamp * 1000),
        terms: terms,
      });

      return result;
    }, []);
  },

  _selectGroupData(idx) {
    return (d) => {
      return d.terms[idx] ? d.terms[idx].count : 0;
    };
  },

  _group() {
    // Emulate a crossfilter group because our data is already grouped on the server side
    return { all: () => { return this.state.data; } };
  },

  _addChartLegend(height) {
    const legendPrefix = this.state.sortOrder === 'asc' ? 'Bottom' : 'Top';
    const legend = dc.legend()
      .horizontal(true)
      .x(this.CHART_MARGINS.get('left') + 12)
      .y(height - 20)
      .itemHeight(12)
      .autoItemWidth(true)
      .gap(5)
      .maxItems(5) // We cannot show more without overwriting the "Time" x axis label
      .legendText((d, i) => {
        return `${legendPrefix} ${i + 1}`;
      });

    this._chart.legend(legend);
  },

  _addChartStacks(limit) {
    this._chart.group(this._group(), 0, this._selectGroupData(0));

    for (let i = 1; i < limit; i += 1) {
      this._chart.stack(this._group(), 0, this._selectGroupData(i));
    }
  },

  _renderChart() {
    const { interval, timerange, limit, width, height } = this.state;
    const dimension = this._crossfilter.dimension(d => d3.time[interval](d.key));

    this._chart = dc.barChart(this._chartRef);

    this._chart
      .width(width)
      .height(height)
      .margins(this.CHART_MARGINS.toJS())
      .dimension(dimension)
      .x(d3.time.scale.utc().domain([timerange.from, timerange.to]))
      .elasticX(false)
      .elasticY(true)
      .round(d3.time[interval].utc.round)
      .xUnits(d3.time[interval].utc.range)
      .renderHorizontalGridLines(true)
      .brushOn(false)
      .xAxisLabel('Time')
      .yAxisLabel(this.props.config.field)
      .colors(D3Utils.glColourPalette())
      .transitionDelay(0)
      .transitionDuration(0)
      .title(function getTitle(d) {
        const idx = this.layer;
        if (d.terms[idx]) {
          return `${d.key.toISOString()}\n${d.terms[idx].term}: ${d.terms[idx].count}`;
        }
        return 'no title';
      })
      .renderLabel(false);

    this._addChartLegend(height);
    this._addChartStacks(limit);

    this._chart.xAxis()
      .ticks(graphHelper.customTickInterval())
      .tickFormat(graphHelper.customDateTimeFormat());
    this._chart.yAxis()
      .ticks(3)
      .tickFormat((value) => {
        return Math.abs(value) > 1e+30 ? value.toPrecision(1) : d3.format('.2s')(value);
      });

    this._chart.render();
  },

  _redrawChart() {
    const { data, timerange, interval, limit } = this.state;

    // Replace data in crossfilter
    this._crossfilter.remove();
    this._crossfilter.add(data);

    // Add all the data stacks to the chart
    this._addChartStacks(limit);

    // Update chart properties to new data
    this._chart
      .x(d3.time.scale.utc().domain([timerange.from, timerange.to]))
      .round(d3.time[interval].utc.round)
      .xUnits(d3.time[interval].utc.range);

    // Redraw and rescale to ensure a correct graph
    this._chart.rescale().redraw();
  },

  _resizeChart(width, height) {
    this._addChartLegend(height);
    this._chart
      .width(width)
      .height(height)
      .rescale()
      .redraw();
  },

  render() {
    return (
      <div>
        <div ref={(c) => { this._chartRef = c; }} id={`visualization-${this.props.id}`} style={{ width: '100%' }} />
      </div>
    );
  },
});

export default QuickValuesHistogramVisualization;
