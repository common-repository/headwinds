<?php

// Copyright (c) Tien Le, Thai Bui, Wu-chang Feng 2007-2011
// Portland State University
define('PRIVATE_KEY','VrIDKlCHheYsi0tYUr9U');
define('API_KEY','512cd0d516d3124c77000001');
define('INTERVAL', 60*5); //period where two keys can exist at the same time.
define('REFRESHING_TIME', 24 * 3600);

/*
 * Verify if user actually solve the puzzle before posting
 *  @param $Adone Hash used for verification
 *  @param $Data  Contains information of user's post
 *  @param $S     Local score
 *  @param $ts    timestamp
 *  @return       1 if user actually solve the puzzle, 0 otherwise
 */
function _headwinds2_verify_hash_cookie($Adone, $Data, $S, $ts){
    //if submittion happens in transition period, two keys can exist at the same time.
    $Ks_array = generateKsArray();
    //use $Ks to verify the answer
    foreach($Ks_array as $Ks)
    {
        $total = $Data.$Ks.$S.$ts;
        $Cookie = hash('md5', $total);
        $final = $Ks.$Cookie;
        if(md5($final) == $Adone){
            return 1;
        }
    }
    return 0;
}

function _headwinds2_return_initial_cookie($msg, $author, $email){

    $Ks = getKsFromPK(PRIVATE_KEY);
    $ip = preg_replace( '/[^0-9., ]/', '', $_SERVER['REMOTE_ADDR'] );
    $S = 10; // Local score
    $ts = date("m.d.y");
    $Data = $msg.$author.$email;

    $total = $Data.$Ks.$S.$ts;
    $Cookie = hash('md5', $total);
    return array(
        'Cookie' =>  $Cookie,
        'ts' => $ts,
        'S'     => $S,
        'comment_author' => $author,
        'comment_author_email' => $email,
        'comment_author_ip' => $ip,
        'comment_date' => $ts,
        'comment_author_url' => 'http://google.com',
        'comment_content' => $msg,
        'Data'  => $Data,
        'api_key' => API_KEY
    );
}

 /*
 * Generate new Ks from the private key. If generation happens at the beginning of a period, two Ks are created.
 * @param  $private_key
 * @return  $Ks_array array contains key(s)
 */
function generateKsArray()
    {
        $dateTime = new DateTime("now");
        $ts = $dateTime->getTimestamp();
        if (intval($ts%REFRESHING_TIME) < INTERVAL)
            $Ks_array = array ( getKsFromPK(PRIVATE_KEY),  getKsFromPK(PRIVATE_KEY,true));
        else
            $Ks_array = array ( getKsFromPK(PRIVATE_KEY));
        return $Ks_array;
    }

/*
 * Generate new Ks from the private key. The generated key is different for each period indicated by REFRESHING_TIME
 * It can also be used to generated Ks from the previous period by setting the $previous param to true
 * @param  $private_key
 * @param  $previous: set to true if wanting to generate key of previous period
 * @return  Ks
 */
function getKsFromPK($private_key, $previous = false)
    {
        if ($previous == true)
            $k = 1;
        else
            $k = 0;
        $dateTime = new DateTime("now");
        $ts = $dateTime->getTimestamp();
        $concat = (intval( $ts /REFRESHING_TIME) - $k). $private_key ;
        return hash ('sha256', $concat);
        //return $concat;
    }

//OLD VERSION
/**
 * Encodes the given data into a query string format
 * @param $data - array of string elements to be encoded
 * @return string - encoded request
 */
function _headwinds_qsencode ($data) {
    $req = "";
    foreach ( $data as $key => $value )
        $req .= $key . '=' . urlencode( stripslashes($value) ) . '&';

    // Cut the last '&'
    $req=substr($req,0,strlen($req)-1);
    return $req;
}
function _headwinds_encode_msg(){
    if(empty($_POST['ipaddress'])){
        $ip = preg_replace( '/[^0-9., ]/', '', $_SERVER['REMOTE_ADDR'] );
    }else{
        $ip = $_POST['ipaddress'];
    }

    $api_key = '123789';
    $POST['url'] = 'http://google.com';
    $comment = array(
        // should be filled by application admin
        'comment_author' => trim($_POST['author']),
        'comment_author_email' => trim($_POST['email']),
        'comment_author_url' => "http://berich.vn",
        'comment_content' => trim($_POST['comment']),
        'comment_author_ip' => $ip,

        'comment_post_ID' => 34,
        //'comment_parent'  => trim($_POST['comment_parent']),
        'comment_type' => '',
        'user_id' => '',
        'comment_agent' => $_SERVER['HTTP_USER_AGENT'],
        'comment_date' => date('Y-m-d'),
        'api_key' => $api_key

    );
    return $comment;
}

function _headwinds_http_post($host, $path, $data, $port = 80){
    $req = _headwinds_qsencode($data);

    $http_request  = "POST $path HTTP/1.0\r\n";
    $http_request .= "Host: $host\r\n";
    $http_request .= "Content-Type: application/x-www-form-urlencoded;\r\n";
    $http_request .= "Content-Length: " . strlen($req) . "\r\n";
    $http_request .= "User-Agent: headwinds/PHP\r\n";
    $http_request .= "\r\n";
    $http_request .= $req;
    $response = '';
    if( false == ( $fs = @fsockopen($host, $port, $errno, $errstr, 10) ) ) {
        die ('Could not open socket');
    }

    fwrite($fs, $http_request);

    while ( !feof($fs) )
        $response .= fgets($fs, 1160); // One TCP-IP packet
    fclose($fs);
    $response = explode("\r\n\r\n", $response, 2);
    return $response;
}

?>
