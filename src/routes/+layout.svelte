<script>
    import './app.css';
    import { ORIGIN } from '$lib/env';

    import banner from '$lib/brand/link-preview.png?url';

    import GitHub from '@iconify-icons/simple-icons/github';
    import Icon from '@iconify/svelte';
    import Spectro from '$lib/brand/logomark/48-logomark.png';

    import Footer from './Footer.svelte';
    import NavLink from './NavLink.svelte';

    const { children } = $props();
</script>

<svelte:head>
    <meta property="og:image" content="{ORIGIN.origin}{banner}" />
</svelte:head>

<div class="flex flex-col">
    <header class="sticky top-0 z-10">
        <nav class="navbar bg-base-200 h-20 p-4 shadow-sm lg:pr-10">
            <div class="navbar-start">
                <a href="/"><img src={Spectro} alt="Spectro logo" class="w-12" /></a>
            </div>
            <ul class="menu navbar-center menu-horizontal space-x-1">
                <li><NavLink href="/guide/">Guide</NavLink></li>
                <li><NavLink href="/reference/">Reference</NavLink></li>
            </ul>
            <div class="navbar-end">
                <a rel="external" target="_blank" href="https://github.com/BastiDood/spectro"
                    ><Icon icon={GitHub} width="32" /></a
                >
            </div>
        </nav>
    </header>
    {@render children()}
</div>
<Footer />
