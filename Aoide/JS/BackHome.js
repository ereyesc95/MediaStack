//Generate random number 
function randomIntFromInterval(min, max) { // min and max included 
    return Math.floor(Math.random() * (max - min + 1) + min)
}
//Set Navegation Bar
$.get("/Forms/BackHome.html", function (data) {
    $(".body-background").replaceWith(data);
    $.ajax({
        type: "POST",
        async: false,
        url: "/Forms/Home.aspx/GetImageURL",
        data: '',
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function (imageData) {
            for (var i = 0; i < imageData.d.length; i++) {
                $(".back-images").append('<img class="back-img" src="' + String(imageData.d[i]) + '" style="width:' + String(randomIntFromInterval(100, 400)) + 'px">');
            }
        }
    });
});