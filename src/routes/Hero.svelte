<script>
    import Spectro from '$lib/brand/logomark/logomark-transparent.svg';
    import TextLogo from '$lib/brand/logotype/logotype-dark-textonly.svg';
</script>

<div class="flex flex-col items-center gap-6 self-center p-12 md:gap-8">
    <div class="flex flex-col justify-center gap-6 md:flex-row md:gap-12 md:py-8">
        <img
            src={Spectro}
            alt="Spectro mascot"
            class="max-h-48 animate-float object-contain drop-shadow-[0_0_32px_rgba(255,255,157,0.35)]"
        />
        <img src={TextLogo} alt="Spectro logo" class="max-h-32 object-contain md:max-h-48" />
    </div>
    <h1 class="text-center text-lg md:text-xl">A multi-channel confession bot for Discord with anonymous replies.</h1>
    <div class="grid grid-flow-col gap-4">
        <div class="tooltip tooltip-primary" data-tip="Coming soon!">
            <button class="btn btn-primary rounded-full md:px-8 md:text-lg" disabled>Add to Discord</button>
        </div>
        <a href="/guide/">
            <button class="btn btn-secondary rounded-full md:px-8 md:text-lg">Read the Guide</button>
        </a>
    </div>
</div>
