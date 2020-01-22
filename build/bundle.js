var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function flush() {
        const seen_callbacks = new Set();
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    callback();
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    /* src/App.svelte generated by Svelte v3.17.2 */

    function create_if_block_1(ctx) {
    	let h2;

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "Red Wins";
    			attr(h2, "id", "red-wins-text");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    		}
    	};
    }

    // (98:6) {#if blueWon}
    function create_if_block(ctx) {
    	let h2;

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "Blue Wins";
    			attr(h2, "id", "blue-wins-text");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let t0;
    	let div3;
    	let h1;
    	let t2;
    	let div2;
    	let div0;
    	let h20;
    	let t3;
    	let t4;
    	let button0;
    	let t6;
    	let button1;
    	let t8;
    	let t9;
    	let div1;
    	let h21;
    	let t10;
    	let t11;
    	let button2;
    	let t13;
    	let button3;
    	let t15;
    	let t16;
    	let button4;
    	let dispose;
    	let if_block0 = /*redWon*/ ctx[3] && create_if_block_1();
    	let if_block1 = /*blueWon*/ ctx[2] && create_if_block();

    	return {
    		c() {
    			t0 = space();
    			div3 = element("div");
    			h1 = element("h1");
    			h1.textContent = "Magic The Gather Game Counter";
    			t2 = space();
    			div2 = element("div");
    			div0 = element("div");
    			h20 = element("h2");
    			t3 = text(/*redPlayerPoints*/ ctx[0]);
    			t4 = space();
    			button0 = element("button");
    			button0.textContent = "+";
    			t6 = space();
    			button1 = element("button");
    			button1.textContent = "-";
    			t8 = space();
    			if (if_block0) if_block0.c();
    			t9 = space();
    			div1 = element("div");
    			h21 = element("h2");
    			t10 = text(/*bluePlayerPoints*/ ctx[1]);
    			t11 = space();
    			button2 = element("button");
    			button2.textContent = "+";
    			t13 = space();
    			button3 = element("button");
    			button3.textContent = "-";
    			t15 = space();
    			if (if_block1) if_block1.c();
    			t16 = space();
    			button4 = element("button");
    			button4.textContent = "Start Game";
    			document.title = "MTG Game Counter";
    			attr(h20, "id", "red-player-point");
    			attr(button0, "class", "plus svelte-z40xq6");
    			attr(button1, "class", "minus svelte-z40xq6");
    			attr(div0, "class", "player svelte-z40xq6");
    			attr(div0, "id", "red-player");
    			attr(h21, "id", "blue-player-point");
    			attr(button2, "class", "plus svelte-z40xq6");
    			attr(button3, "class", "minus svelte-z40xq6");
    			attr(div1, "class", "player svelte-z40xq6");
    			attr(div1, "id", "blue-player");
    			attr(div2, "id", "controls-container");
    			attr(div2, "class", "svelte-z40xq6");
    			attr(button4, "id", "start_game");
    			attr(button4, "class", "svelte-z40xq6");
    			attr(div3, "id", "container");
    			attr(div3, "class", "svelte-z40xq6");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, div3, anchor);
    			append(div3, h1);
    			append(div3, t2);
    			append(div3, div2);
    			append(div2, div0);
    			append(div0, h20);
    			append(h20, t3);
    			append(div0, t4);
    			append(div0, button0);
    			append(div0, t6);
    			append(div0, button1);
    			append(div0, t8);
    			if (if_block0) if_block0.m(div0, null);
    			append(div2, t9);
    			append(div2, div1);
    			append(div1, h21);
    			append(h21, t10);
    			append(div1, t11);
    			append(div1, button2);
    			append(div1, t13);
    			append(div1, button3);
    			append(div1, t15);
    			if (if_block1) if_block1.m(div1, null);
    			append(div3, t16);
    			append(div3, button4);

    			dispose = [
    				listen(button0, "click", /*plusRed*/ ctx[5]),
    				listen(button1, "click", /*minusRed*/ ctx[6]),
    				listen(button2, "click", /*plusBlue*/ ctx[7]),
    				listen(button3, "click", /*minusBlue*/ ctx[8]),
    				listen(button4, "click", /*startGame*/ ctx[4])
    			];
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*redPlayerPoints*/ 1) set_data(t3, /*redPlayerPoints*/ ctx[0]);

    			if (/*redWon*/ ctx[3]) {
    				if (!if_block0) {
    					if_block0 = create_if_block_1();
    					if_block0.c();
    					if_block0.m(div0, null);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (dirty & /*bluePlayerPoints*/ 2) set_data(t10, /*bluePlayerPoints*/ ctx[1]);

    			if (/*blueWon*/ ctx[2]) {
    				if (!if_block1) {
    					if_block1 = create_if_block();
    					if_block1.c();
    					if_block1.m(div1, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(div3);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			run_all(dispose);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let redPlayerPoints = 0;
    	let bluePlayerPoints = 0;

    	function startGame() {
    		$$invalidate(0, redPlayerPoints = 20);
    		$$invalidate(1, bluePlayerPoints = 20);
    	}

    	function updateScore(player, score) {
    		if (redWon || blueWon) {
    			return;
    		}

    		if (player == "red") {
    			$$invalidate(0, redPlayerPoints += score);
    			return;
    		}

    		$$invalidate(1, bluePlayerPoints += score);
    		return;
    	}

    	const plusRed = updateScore.bind(null, "red").bind(null, 1);
    	const minusRed = updateScore.bind(null, "red").bind(null, -1);
    	const plusBlue = updateScore.bind(null, "blue").bind(null, 1);
    	const minusBlue = updateScore.bind(null, "blue").bind(null, -1);
    	let blueWon;
    	let redWon;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*redPlayerPoints, bluePlayerPoints*/ 3) {
    			 $$invalidate(2, blueWon = redPlayerPoints <= 0 && bluePlayerPoints > 0);
    		}

    		if ($$self.$$.dirty & /*bluePlayerPoints, redPlayerPoints*/ 3) {
    			 $$invalidate(3, redWon = bluePlayerPoints <= 0 && redPlayerPoints > 0);
    		}
    	};

    	return [
    		redPlayerPoints,
    		bluePlayerPoints,
    		blueWon,
    		redWon,
    		startGame,
    		plusRed,
    		minusRed,
    		plusBlue,
    		minusBlue
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, {});
    	}
    }

    const app = new App({
      target: document.body
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
