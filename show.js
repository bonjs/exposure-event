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
 
 */
var Show = function (opt) {
    debugger;

    var me = this;
    console.log('constructor');

    this.events = [];
    this.selector = opt.selector;




    var type = Object.prototype.toString.call(opt.type) == '[object Array]' ? opt.type : [opt.type || 'exposure'];

    var domArr = this.domArr = [];        // 曝光事件使用的数组
    var domArrStay = this.domArrStay = [];    // 停留事件使用的数组

    var doms = document.querySelectorAll(this.selector);    // 要监控的dom
    var visibleDoms = this.visibleDoms = [];   // 处于可见区域的dom

    var container = opt.container || window;

    // 初始化时设置的监听事件
    if (opt.listeners) {
        for (var k in opt.listeners) {
            this.on(k, opt.listeners[k]);
        }
    }

    function dealVisibleDoms(item) {
        var visibleDoms = this.visibleDoms;
        if (item.intersectionRatio > 0.6666666) {
            //console.log('展示', item.target)
            visibleDoms.push(item.target);
        } else {
            //console.log('消失', item.target)
            for (var i = 0; i < visibleDoms.length; i++) {
                if (visibleDoms[i] === item.target) {
                    visibleDoms.splice(i, 1);
                }
            }
        }
    }

    var actions = {
        stay: function (item) {
            if (item.intersectionRatio > 0.6666666) {
                item.target.accessTime = Date.now(); // 展示的时候把时间记录在dom上
                delete item.target.leftTime;
                //console.log(item.target.innerHTML, '进入')
            } else {
                //console.log(item.target.innerHTML, '离开')

                // 进入时间不存在，没法计算停留时间，所以return
                // 离开时间存在，说明已之前发过事件但尚未脱离可视区域，这部分要过滤，所以return
                if (!item.target.accessTime || item.target.leftTime) {
                    return;
                }
                item.target.leftTime = Date.now(); // 消失时把时间记录在dom上
                var stayTime = item.target.leftTime - item.target.accessTime;  // 消失的时候计算
                if (stayTime > 3000) {
                    //console.log('stayTime', stayTime, item.target)
                    domArrStay.push(item.target);
                }

                delete item.target.accessTime;
                delete item.target.leftTime;

            }
        },
        exposure: function (item) {
            if (item.intersectionRatio > 0.6666666) {
                //console.log('展示', item.target, item.intersectionRatio)
                if (!domArr.some(function (it) {
                    return it === item.target;
                })) {
                    domArr.push(item.target)
                }
            }
        }
    }

    var isInit;
    var observer = this.observer = new IntersectionObserver(function (entries, x) {
        //clearTimeout(stayTimer);
        entries.forEach(function (item) {
            type.forEach(function (t) {
                actions[t] && actions[t].call(this, item);
            })

            dealVisibleDoms.call(me, item);
        });


        // 初始化时触发一次stop
        if (!isInit) {
            me.fireEvent('stop', domArr);
            isInit = true;
        }
        // observer.disconnect() // 统计到就不在需要继续观察了
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
    if (type.indexOf('stay') > -1) {
        this.on('stop', function () {
            console.log('触发stop')
            stayTimer = setTimeout(function () {

                visibleDoms.forEach(function (dom) {
                    if (!domArrStay.some(function (it) {
                        return it === dom;
                    }) && !dom.leftTime) {
                        domArrStay.push(dom);
                    }
                });

                domArrStay.forEach(function (it) {
                    it.leftTime = Date.now();
                })

                me.fireEvent('stay', domArrStay);
                console.log('触发stay')
                domArrStay.length = 0;
            }, 3000);
        });
    }


    var begin;
    var fn = debounce(function () {
        console.log('停止滚动')
        me.fireEvent('stop', domArr);
        begin = false;
    });

    // scroll事件主要用于兼听停止滚动时动作
    container.addEventListener('scroll', function () {
        if (!begin) {
            console.log('开始滚动');
            begin = true;

            domArr.length = 0;

            clearTimeout(stayTimer);
        }

        fn();
    });
}


Show.prototype = {
    constructor: Show,
    reload: function () {   // 重新读取dom(用于目标dom有变化的场合)
        var me = this;
        this.visibleDoms.length = 0;
        var doms = document.querySelectorAll(this.selector);

        doms.forEach(function (item) {
            me.observer.unobserve(item);
            me.observer.observe(item);
        });

        this.fireEvent('stop', this.domArr);
    },
    getVisibleDoms: function () {
        return this.visibleDoms;
    },
    // 动态添加的监听事件
    on: function (eventName, eventFn) {
        if (/^[\w-]+$/.test(eventName) && typeof eventFn == 'function') {
            this.events.push({
                name: eventName,
                fn: eventFn
            });
        }
    },
    fireEvent: function (eventName) {
        var me = this;
        var _arguments = arguments;
        if (eventName == undefined) {
            return;
        }
        var eventFns = this.events.filter(function (it) {
            return it.name == eventName;
        });

        eventFns.forEach(function (it) {
            it.fn && it.fn.apply(me, Array.prototype.splice.call(_arguments, 1));
        });
    }
}
