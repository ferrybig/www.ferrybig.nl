---
date: "2019-07-10"
tags: ["tech", "from-scratch"]
thumbnail:
    image: thumbnail.png
    embed: https://projects.ferrybig.nl/breakout-modules/
    link: https://github.com/ferrybig/breakout-modules/
    alt: The resulting breakout game
---
# Creating a breakout game again

Creating small Javascript games is a great way to learn coding. So I make
another breakout game. This time I used Ecmascript Modules and classes.

The core design of this breakout is an event bus architecture. Every entity can
throw an event, which affects the game in a certain way.For example, the score
reducer listens to the brick destroyed event to handle updating the score. The
powerup entity watches for collision with the paddle, and throws an activated
event, which other entities on the page catch.

Another special feature is the mouse capture. During the game, the mouse is
captured, so it does not go of the screen vertically. It also updates the mouse
cursor depending what kind of element the user hovers the mouse on.

When the game loads for the first time, it makes api requests to load all the
used images. This could be optimized in the future with an image grid, but it
hasn't been done here.
