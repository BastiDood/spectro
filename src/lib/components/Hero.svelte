<script lang="ts">
    import Spectro from '$lib/brand/logomark/logomark-transparent.svg';
    import TextLogo from '$lib/brand/logotype/logotype-dark-textonly.svg';
</script>

<div class="flex flex-col items-center gap-6 p-12 md:gap-8">
    <div class="flex flex-col justify-center gap-6 md:flex-row md:gap-12 md:py-8">
        <img
            src={Spectro}
            alt="Spectro mascot"
            class="max-h-48 animate-floatUpDown object-contain drop-shadow-[0_0_32px_rgba(255,255,157,0.35)]"
        />
        <img src={TextLogo} alt="Spectro logo" class="max-h-32 object-contain md:max-h-48" />
    </div>
    <h1 class="text-center text-lg md:text-xl">A confession bot for Discord with multi-channel support.</h1>
    <button class="btn btn-primary rounded-full font-semibold md:px-8 md:text-lg">Add to Discord</button>
</div>
