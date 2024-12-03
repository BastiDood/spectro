<script lang="ts">
    import Spectro from '$lib/brand/logomark/logomark-transparent.svg';
    import TextLogo from '$lib/brand/logotype/logotype-dark-textonly.svg';
</script>

<div class="flex flex-col items-center gap-6 p-12 md:gap-8">
    <div class="flex flex-col justify-center gap-12 md:flex-row md:py-8">
        <img
            src={Spectro}
            alt="Spectro mascot"
            class="max-h-48 animate-floatUpDown object-contain drop-shadow-[0_0_32px_rgba(255,255,157,0.35)]"
        />
        <img src={TextLogo} alt="Spectro logo" class="max-h-32 object-contain md:max-h-48" />
    </div>
    <h1 class="text-center text-lg md:text-xl">A confession bot for Discord with multi-channel support.</h1>
    <button
        class="w-fit rounded-full bg-primary-500 px-4 py-2 font-semibold text-primary-950 md:px-8 md:py-4 md:text-lg"
        >Add to Discord</button
    >
</div>
