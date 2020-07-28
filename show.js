/**
 * 1，支持多实例
 * 2，支持同时两种类型，曝光(exposure,默认), 停留(stay)
 * 3，使用性能更好的IntersectionObserver，老式终端不支持，引入IntersectionObserver polyfill做兼容,
 *      所以只要使用曝光或停留事件的界面要引入src/global/script/lib/intersection-observer.js
 *      see https://www.npmjs.com/package/intersection-observer
 * 4，被监控的dom如果有2/3处于可见区域则视为可见
 * 
 *      1，曝光(exposure,默认)
 *          范围：只要在曾经出现在页面可视区域内的，都被会统计
 *          触发时机：1，页面初始化时 2，滚动停止时
 *
 *      2，停留(stay)
 *          范围：只要在出现在页面可视区域内单次时长超过3s，都被被统计
 *          触发时机：1，页面初始化时 2，滚动停止后超过3s
 *
 *  property:
        var show = new Show({
            selector: '#chat [data-tid]',   // selector: 选择器，stop执行时的传来的第一个参数即为此选择器的dom
            type: ['stay', 'exposure'],     // type: 类型,支持两种stay, exposure单个或同时
            listeners: {                    // listeners: 初始时配置监听的事件
                stop: function (doms) {     // 滚动停止时执行stop函数
                    console.log("发送曝光事件", doms)
                },
                stay: function (doms) {     // 滚动停止时3s执行stay函数(如果这段时间内没有被clear)
                    console.log('发送停留事件', doms);
                }
            }
        });

    method:
        reload()  // show.reload();        // 重新加载要监控的dom(初始化时可能dom不存在或者后期dom有变化需要重新监听)
        on(eventName[String], fn[Function]) // 动态监听事件
        fireEvent(eventName[String], ...*)  // 触发事件

    event:
        stop    // 滚动停止时执行stop函数
        stay    // 滚动停止时3s执行stay函数(如果这段时间内没有被clear)
        stop-stay   // 包含stop和stay, 滚动停止时触发一次，3s后会再触发一次（如果这段时间内没有被clear），stay中曝光的dom会排除stop中曝光的dom

 */
var Show = function (opt) {

    var me = this;

    this.events = {};

    var container = opt.container || window;
    this.selector = opt.selector;

    var doms = document.querySelectorAll(this.selector);    // 要监控的dom

    var domsShow = this.domsShow = [];    // 曝光事件使用的数组
    var domsStay = this.domsStay = [];    // 停留事件使用的数组
    var domsVisiable = this.domsVisiable = [];   // 处于可见区域的dom

    // 初始化时设置的监听事件
    if (opt.listeners) {
        for (var k in opt.listeners) {
            this.on(k, opt.listeners[k]);
        }
    }

    // 维护三个数组domsShow，domsStay，domsVisiable的时机
    var actions = {
        stay: function (item) {         // 记录停留时的dom(enter时记录进入时间，exit时记录退出时间，判断停留时长，超过3s存入domsStay)
            enterOrExit.call(this, item, {
                enter: function (dom) {
                    dom.accessTime = Date.now(); // 展示的时候把时间记录在dom上
                    delete dom.leftTime;
                },
                exit: function (dom) {
                    // 进入时间不存在，没法计算停留时间，所以return
                    // 离开时间存在，说明已之前发过事件但尚未脱离可视区域，这部分要过滤，所以return
                    if (!dom.accessTime || dom.leftTime) {
                        return;
                    }
                    dom.leftTime = Date.now(); // 消失时把时间记录在dom上
                    var stayTime = dom.leftTime - dom.accessTime;  // 消失的时候计算
                    if (stayTime > 3000) {
                        //console.log('stayTime', stayTime, item.target)
                        this.domsStay.push(dom);
                    }

                    delete dom.accessTime;
                    delete dom.leftTime;
                }
            })
        },
        show: function (item) {         // 记录曝光的dom，enter添加
            enterOrExit.call(this, item, {
                enter: function (dom) {
                    //console.log('展示', item.target, item.intersectionRatio)
                    if (!this.domsShow.some(function (it) {
                        return it === dom;
                    })) {
                        this.domsShow.push(dom)
                    }
                }
            })
        },
        visible: function (item) {  // 记录当前可见dom，enter时添加，exit时删除
            enterOrExit.call(this, item, {
                enter: function (dom) {
                    this.domsVisiable.push(dom);
                },
                exit: function (dom) {
                    var domsVisiable = this.domsVisiable;
                    //console.log('消失', item.target)
                    for (var i = 0; i < domsVisiable.length; i++) {
                        if (domsVisiable[i] === dom) {
                            domsVisiable.splice(i, 1);
                        }
                    }
                }
            })
        }
    }

    this.isInit = false;

    var observer = this.observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (item) {
            ['show', 'stay', 'visible'].forEach(function (t) {
                actions[t] && actions[t].call(me, item);
            });
        });

        // 初始化时触发一次stop
        if (!me.isInit) {
            me.fireEvent('init');
            me.isInit = true;
        }
    }, {
        root: container == window ? null : container,
        threshold: [0.6666666]  // 触发时机, 2/3可见时触发
    });
    doms.forEach(function (item) {
        observer.observe(item);
    });


    var stayTimer;
    // 停留事件，在停止滚动时setTimeout3秒后尝试发送停留事件，
    // 如果3s内IntersectionObserver状态有改变，则清除此setTimeout
    function stayAction() {
        stayTimer = setTimeout(function () {

            domsVisiable.forEach(function (dom) {
                if (!domsStay.some(function (it) {
                    return it === dom;
                }) && !dom.leftTime) {
                    domsStay.push(dom);
                }
            });

            domsStay.forEach(function (it) {
                it.leftTime = Date.now();
            })

            me.fireEvent('stay', domsStay);       // stay(滚动停止3s后)
            me.fireEvent('stop-stay', domsVisiable); // stop-stay第二波(滚动停止3s后)的stop-stay事件只发当前可见dom

        }, 3000);
    }

    this.on('stop', function() {
        stayAction.call(me);
    });

    // init时初始stop
    this.on('init', function() {
        this.fireEvent('stop', domsShow);
    })

    // 每次触发后清空对应的dom数组
    this.on(['stop', 'stay', 'stop-stay'], function(doms) {
        doms.length = 0;
    });


    var begin;
    var fn = debounce(function () {
        me.fireEvent('stop', domsShow);           // stop时发曝光的dom
        me.fireEvent('stop-stay', domsStay);      // stop-stay第一波发滚动过程中超过3s的dom
        begin = false;
    }, 500);

    // scroll事件主要用于兼听停止滚动时动作
    container.addEventListener('scroll', function () {
        if (!begin) {
            me.fireEvent('begin');
            begin = true;
            clearTimeout(stayTimer);
        }

        fn();
    });

    function enterOrExit(item, cb) {
        if (item.intersectionRatio > 0.6666666) {
            cb && cb.enter && cb.enter.call(this, item.target);
        } else {
            cb && cb.exit && cb.exit.call(this, item.target);
        }
    }

}


Show.prototype = {
    constructor: Show,
    reload: function () {   // 重新读取dom(用于目标dom有变化的场合)
        var me = this;
        this.domsVisiable.length = 0;
        var doms = document.querySelectorAll(this.selector);

        doms.forEach(function (item) {
            me.observer.unobserve(item);
            me.observer.observe(item);
        });

        this.fireEvent('init');
    },
    getVisibleDoms: function () {
        return this.domsVisiable;
    },
    // 动态添加的监听事件
    on: function (eventName, eventFn) {
        var me = this;
        if (this.isArray(eventName)) {
            eventName.forEach(function (eName) {
                me.on(eName, eventFn);
            });
        } else {
            if (/^[\w-]+$/.test(eventName) && typeof eventFn == 'function') {
                if(!this.events[eventName]) {
                    this.events[eventName] = [];
                }
                this.events[eventName].push({
                    name: eventName,
                    fn: eventFn
                });
            }
        }
    },
    fireEvent: function (eventName) {
        var me = this;
        var _arguments = arguments;
        if (eventName == undefined) {
            return;
        }

        if(!this.events[eventName]) {
            return;
        }

        this.events[eventName].forEach(function (it) {
            it.fn && it.fn.apply(me, Array.prototype.slice.call(_arguments, 1));
        });
    },
    isArray: function (v) {
        return Object.prototype.toString.call(v) == '[object Array]';
    }
}